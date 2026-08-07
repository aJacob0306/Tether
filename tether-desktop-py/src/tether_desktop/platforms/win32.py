"""Windows adapter.

Replaces the embedded PowerShell in `src/platform/win32.js` with native Python:
`winreg` for the registry, `psutil` for processes, and `pywin32` for the Win32
foreground and idle calls.

One deliberate fix: the PowerShell `$helperPathPattern` was built as `\\(bin|...)\\`,
which .NET rejects as an invalid regular expression. Because every use of it sat inside
a `try/catch`, the recursive executable scan, the Steam library scan, and the running
process scan all silently found nothing. The pattern is written correctly below, so a
Windows inventory from this version will be noticeably larger than before.

Windows-only imports are deferred so the pure helpers stay importable (and testable)
on any operating system.
"""

from __future__ import annotations

import logging
import os
import re
import socket
import sys
from pathlib import Path, PurePath
from typing import Any, Iterable, Iterator

from ..models import ActiveApp, DetectedApp

if sys.platform == "win32":  # pragma: no cover - exercised only on Windows
    import winreg

    import psutil
    import win32api
    import win32gui
    import win32process

logger = logging.getLogger(__name__)

PLATFORM_ID = "windows"
EXECUTABLE_SCAN_DEPTH = 4
MAIN_EXECUTABLE_SCAN_DEPTH = 3

IGNORED_EXECUTABLE_NAMES = frozenset(
    {
        "unins000.exe",
        "uninstall.exe",
        "unins.exe",
        "setup.exe",
        "install.exe",
        "update.exe",
        "updater.exe",
        "crashpad_handler.exe",
        "squirrel.exe",
        "maintenancetool.exe",
    }
)

_IGNORED_BASENAME_PATTERNS = (
    re.compile(r"(^|[-_\s])(installer|install|uninstall|updater?|patcher)([-_\s]|$)"),
    re.compile(r"(setup|installer|uninstall|updater?|patcher)([-_\s]|$)"),
)

# Directories that hold bundled helper binaries rather than the app the user launches.
HELPER_PATH_PATTERN = re.compile(
    r"[\\/](?:bin|resources|locales|swiftshader|node_modules|plugins|drivers|redist"
    r"|redistributable|crashpad|cef|vc_redist)[\\/]",
    re.IGNORECASE,
)

LAUNCHER_URL_PATTERN = re.compile(
    r"^(steam|com\.epicgames\.launcher|uplay|origin|goggalaxy|battlenet):", re.IGNORECASE
)
_URL_LINE_PATTERN = re.compile(r"^URL=(.+)$", re.MULTILINE)
_STEAM_PATH_PATTERN = re.compile(r'"path"\s+"([^"]+)"')
_QUOTED_EXECUTABLE_PATTERN = re.compile(r'^[^"]*?\.exe', re.IGNORECASE)
_ENVIRONMENT_VARIABLE_PATTERN = re.compile(r"%([^%]+)%")

UNINSTALL_REGISTRY_ROOTS = (
    ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    ("HKLM", r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
)

APP_PATHS_REGISTRY_ROOTS = (
    ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\App Paths"),
    ("HKLM", r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\App Paths"),
)


# ---------------------------------------------------------------------------
# Pure helpers (no Windows APIs, so they can be unit tested anywhere)
# ---------------------------------------------------------------------------


def expand_environment_variables(value: str) -> str:
    """Expand `%NAME%` the way Windows does, leaving unknown names untouched.

    Written out rather than using `os.path.expandvars`, which only understands the
    `%NAME%` form when it is actually running on Windows.
    """
    return _ENVIRONMENT_VARIABLE_PATTERN.sub(
        lambda match: os.environ.get(match.group(1), match.group(0)), value
    )


def is_ignored_executable_name(executable: str | None) -> bool:
    """True for installers, updaters, and crash handlers that are not real apps."""
    if not executable:
        return True

    normalized = executable.lower()
    base_name = PurePath(normalized).stem
    if normalized in IGNORED_EXECUTABLE_NAMES:
        return True

    return any(pattern.search(base_name) for pattern in _IGNORED_BASENAME_PATTERNS)


def is_helper_path(relative_path: str) -> bool:
    return bool(HELPER_PATH_PATTERN.search(relative_path))


def executable_from_command(command: str | None) -> str | None:
    """Pull the executable out of a registry command string such as DisplayIcon."""
    if not command:
        return None

    expanded = expand_environment_variables(command.strip())
    if not expanded:
        return None

    if expanded.startswith('"'):
        end_quote = expanded.find('"', 1)
        if end_quote > 1:
            return expanded[1:end_quote]

    match = _QUOTED_EXECUTABLE_PATTERN.match(expanded)
    if match:
        return match.group(0).strip()

    return expanded.split(" ")[0]


def parse_url_shortcut(contents: str) -> str | None:
    """Read the target of a `.url` shortcut. The last URL line wins, as in PowerShell."""
    matches = _URL_LINE_PATTERN.findall(contents)
    return matches[-1].strip() if matches else None


def is_launcher_url(url: str | None) -> bool:
    return bool(url and LAUNCHER_URL_PATTERN.match(url.strip()))


def parse_steam_libraries(contents: str) -> list[str]:
    return [match.replace("\\\\", "\\") for match in _STEAM_PATH_PATTERN.findall(contents)]


def normalize_windows_app(entry: dict[str, Any]) -> DetectedApp | None:
    display_name = str(entry.get("name") or "").strip()
    executable = str(entry.get("executable") or "").strip()
    install_path = str(entry.get("path") or "").strip()
    source = str(entry.get("source") or "windows_scan").strip()

    if not display_name or not install_path:
        return None

    return {
        "tool_type": "app",
        "value": display_name,
        "display_name": display_name,
        "tool_key": f"path:{install_path.lower()}",
        "bundle_identifier": None,
        "install_path": install_path,
        "platform": PLATFORM_ID,
        "metadata": {"executable": executable, "source": source},
    }


class AppCollector:
    """Accumulates discovered apps, keyed by path so the first hit wins."""

    def __init__(self) -> None:
        self._apps: dict[str, dict[str, Any]] = {}

    def add_executable(self, name: str | None, path: str | None, source: str) -> None:
        if not name or not path:
            return

        try:
            expanded = expand_environment_variables(path.strip().strip('"'))
            if not expanded.lower().endswith(".exe"):
                return

            resolved = Path(expanded)
            if not resolved.is_file():
                return

            resolved_path = str(resolved.resolve())
            executable = PurePath(resolved_path).name
            if is_ignored_executable_name(executable):
                return

            display_name = name.strip() or PurePath(resolved_path).stem
            if not display_name:
                return

            self._apps.setdefault(
                resolved_path.lower(),
                {"name": display_name, "executable": executable, "path": resolved_path, "source": source},
            )
        except OSError:
            logger.debug("Skipped executable %s", path, exc_info=True)

    def add_launcher_url(self, name: str | None, url: str | None, source: str) -> None:
        if not name or not url or not is_launcher_url(url):
            return

        target = url.strip()
        self._apps.setdefault(
            target.lower(),
            {"name": name.strip(), "executable": None, "path": target, "source": source},
        )

    def detected_apps(self) -> list[DetectedApp]:
        normalized = (normalize_windows_app(entry) for entry in self._apps.values())
        by_key = {app["tool_key"]: app for app in normalized if app}
        return sorted(by_key.values(), key=lambda app: app["display_name"].lower())


def iter_files(root: Path, suffix: str, max_depth: int) -> Iterator[Path]:
    """Depth-limited file search, standing in for Get-ChildItem -Recurse -Depth."""
    stack: list[tuple[Path, int]] = [(root, 0)]
    while stack:
        directory, depth = stack.pop()
        try:
            entries = list(directory.iterdir())
        except OSError:
            continue

        for entry in entries:
            try:
                if entry.is_dir():
                    if depth < max_depth:
                        stack.append((entry, depth + 1))
                elif entry.name.lower().endswith(suffix):
                    yield entry
            except OSError:
                continue


def find_main_executable(directory: Path) -> str | None:
    """Guess the app's primary executable inside an install directory.

    Prefers an executable named after the folder, then shallower paths, then larger
    files, which is how the PowerShell version ranked candidates.
    """
    try:
        if not directory.is_dir():
            return None
        resolved_root = directory.resolve()
    except OSError:
        return None

    directory_name = resolved_root.name.lower()
    candidates: list[tuple[int, int, int, str]] = []

    for path in iter_files(resolved_root, ".exe", MAIN_EXECUTABLE_SCAN_DEPTH):
        if is_ignored_executable_name(path.name):
            continue

        relative = str(path)[len(str(resolved_root)) :]
        if is_helper_path(relative):
            continue

        try:
            size = path.stat().st_size
        except OSError:
            continue

        name_rank = 0 if path.stem.lower() == directory_name else 1
        candidates.append((name_rank, len(str(path.parent)), -size, str(path)))

    if not candidates:
        return None

    return min(candidates)[3]


# ---------------------------------------------------------------------------
# Windows-only discovery sources
# ---------------------------------------------------------------------------


def _shortcut_roots() -> list[Path]:
    import win32comext.shell.shell as shell  # noqa: PLC0415
    from win32comext.shell import shellcon  # noqa: PLC0415

    folders = [
        shellcon.CSIDL_COMMON_PROGRAMS,
        shellcon.CSIDL_PROGRAMS,
        shellcon.CSIDL_DESKTOPDIRECTORY,
        shellcon.CSIDL_COMMON_DESKTOPDIRECTORY,
    ]

    roots = []
    for folder in folders:
        try:
            roots.append(Path(shell.SHGetFolderPath(0, folder, None, 0)))
        except Exception:
            logger.debug("Could not resolve shell folder %s", folder, exc_info=True)
    return roots


def _scan_roots() -> list[Path]:
    user_profile = os.environ.get("USERPROFILE", "")
    appdata = os.environ.get("APPDATA", "")
    candidates = [
        os.environ.get("ProgramFiles"),
        os.environ.get("ProgramFiles(x86)"),
        os.environ.get("LOCALAPPDATA"),
        os.path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs") if appdata else None,
        os.path.join(user_profile, "Downloads") if user_profile else None,
        os.path.join(user_profile, "Desktop") if user_profile else None,
        os.path.join(user_profile, "OneDrive", "Desktop") if user_profile else None,
        os.path.join(user_profile, "OneDrive", "Documents") if user_profile else None,
        os.path.join(user_profile, "Documents") if user_profile else None,
    ]
    return [Path(path) for path in candidates if path and Path(path).is_dir()]


def _add_shortcuts(collector: AppCollector) -> None:
    import pythoncom  # noqa: PLC0415
    import win32com.client  # noqa: PLC0415

    pythoncom.CoInitialize()
    try:
        wscript = win32com.client.Dispatch("WScript.Shell")
        for root in _shortcut_roots():
            for link in iter_files(root, ".lnk", max_depth=8):
                try:
                    target = wscript.CreateShortcut(str(link)).TargetPath
                    collector.add_executable(PurePath(target).stem, target, "shortcut")
                except Exception:
                    logger.debug("Could not resolve shortcut %s", link, exc_info=True)

            for link in iter_files(root, ".url", max_depth=8):
                try:
                    url = parse_url_shortcut(link.read_text(encoding="utf-8", errors="ignore"))
                    collector.add_launcher_url(link.stem, url, "url_shortcut")
                except OSError:
                    logger.debug("Could not read url shortcut %s", link, exc_info=True)
    finally:
        pythoncom.CoUninitialize()


def _iter_registry_subkeys(hive_name: str, sub_key: str) -> Iterator[dict[str, Any]]:
    hive = winreg.HKEY_LOCAL_MACHINE if hive_name == "HKLM" else winreg.HKEY_CURRENT_USER
    try:
        root = winreg.OpenKey(hive, sub_key)
    except OSError:
        return

    with root:
        index = 0
        while True:
            try:
                child_name = winreg.EnumKey(root, index)
            except OSError:
                break
            index += 1

            try:
                with winreg.OpenKey(root, child_name) as child:
                    values: dict[str, Any] = {"__name__": child_name}
                    value_index = 0
                    while True:
                        try:
                            name, value, _ = winreg.EnumValue(child, value_index)
                        except OSError:
                            break
                        values[name or "(default)"] = value
                        value_index += 1
                    yield values
            except OSError:
                continue


def _add_registry_uninstall_entries(collector: AppCollector) -> None:
    for hive, sub_key in UNINSTALL_REGISTRY_ROOTS:
        for entry in _iter_registry_subkeys(hive, sub_key):
            display_name = entry.get("DisplayName")
            if not display_name:
                continue

            path = executable_from_command(entry.get("DisplayIcon"))
            if path and is_ignored_executable_name(PurePath(path).name):
                path = None
            if not path and entry.get("InstallLocation"):
                install_location = expand_environment_variables(str(entry["InstallLocation"]).strip('"'))
                path = find_main_executable(Path(install_location))

            collector.add_executable(display_name, path, "registry")


def _add_registry_app_paths(collector: AppCollector) -> None:
    for hive, sub_key in APP_PATHS_REGISTRY_ROOTS:
        for entry in _iter_registry_subkeys(hive, sub_key):
            path = executable_from_command(entry.get("(default)")) or executable_from_command(
                entry.get("Path")
            )
            collector.add_executable(PurePath(entry["__name__"]).stem, path, "app_path")


def _product_name(path: Path) -> str:
    try:
        info = win32api.GetFileVersionInfo(str(path), "\\VarFileInfo\\Translation")
        language, codepage = info[0]
        key = f"\\StringFileInfo\\{language:04x}{codepage:04x}\\ProductName"
        product_name = win32api.GetFileVersionInfo(str(path), key)
        if product_name and product_name.strip():
            return product_name.strip()
    except Exception:
        logger.debug("No version info for %s", path, exc_info=True)
    return path.stem


def _add_executables_under(collector: AppCollector, root: Path, source: str, depth: int) -> None:
    try:
        resolved_root = str(root.resolve())
    except OSError:
        return

    for path in iter_files(root, ".exe", depth):
        if is_ignored_executable_name(path.name):
            continue
        if is_helper_path(str(path)[len(resolved_root) :]):
            continue
        collector.add_executable(_product_name(path), str(path), source)


def _add_shell_application_items(collector: AppCollector, root: Path) -> None:
    """Enumerate a folder through the shell, matching the PowerShell Shell.Application pass.

    The item type string it filters on is localised by Windows, so this contributes
    nothing on non-English installs. The other sources cover the same ground.
    """
    import pythoncom  # noqa: PLC0415
    import win32com.client  # noqa: PLC0415

    pythoncom.CoInitialize()
    try:
        namespace = win32com.client.Dispatch("Shell.Application").Namespace(str(root))
        if not namespace:
            return
        for item in namespace.Items():
            try:
                if item.Type == "Application":
                    collector.add_executable(item.Name, item.Path, "shell_application")
            except Exception:
                continue
    except Exception:
        logger.debug("Shell enumeration failed for %s", root, exc_info=True)
    finally:
        pythoncom.CoUninitialize()


def _steam_library_roots() -> list[Path]:
    library_files = [
        Path(program_files) / "Steam" / "steamapps" / "libraryfolders.vdf"
        for program_files in (
            os.environ.get("ProgramFiles(x86)", ""),
            os.environ.get("ProgramFiles", ""),
        )
        if program_files
    ]

    roots: list[Path] = []
    for library_file in library_files:
        if not library_file.is_file():
            continue
        roots.append(library_file.parent.parent)
        try:
            for path in parse_steam_libraries(library_file.read_text(encoding="utf-8", errors="ignore")):
                roots.append(Path(path))
        except OSError:
            logger.debug("Could not read %s", library_file, exc_info=True)

    return list(dict.fromkeys(roots))


def _add_steam_games(collector: AppCollector) -> list[Path]:
    common_roots = []
    for library_root in _steam_library_roots():
        common_root = library_root / "steamapps" / "common"
        if not common_root.is_dir():
            continue
        common_roots.append(common_root)

        try:
            game_dirs = [entry for entry in common_root.iterdir() if entry.is_dir()]
        except OSError:
            continue

        for game_dir in game_dirs:
            executable = find_main_executable(game_dir)
            if executable:
                collector.add_executable(game_dir.name, executable, "steam")

    return common_roots


def _add_running_processes(collector: AppCollector, allowed_roots: Iterable[Path]) -> None:
    normalized_roots = []
    for root in allowed_roots:
        try:
            normalized_roots.append(str(root.resolve()).lower())
        except OSError:
            continue

    for process in psutil.process_iter(["name", "exe"]):
        try:
            executable_path = process.info.get("exe")
            if not executable_path or not executable_path.lower().endswith(".exe"):
                continue

            normalized_path = str(Path(executable_path).resolve()).lower()
            for root in normalized_roots:
                if not normalized_path.startswith(root):
                    continue
                if is_helper_path(normalized_path[len(root) :]):
                    break
                collector.add_executable(
                    PurePath(executable_path).stem, executable_path, "running_process"
                )
                break
        except (psutil.Error, OSError):
            continue


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class WindowsAdapter:
    platform_id = PLATFORM_ID
    platform_label = "Windows"

    def detect_installed_apps(self) -> list[DetectedApp]:
        collector = AppCollector()

        # Each source is independent; one failing must not lose the whole inventory.
        for step in (_add_shortcuts, _add_registry_uninstall_entries, _add_registry_app_paths):
            try:
                step(collector)
            except Exception:
                logger.warning("App discovery step %s failed", step.__name__, exc_info=True)

        scan_roots = _scan_roots()
        for root in scan_roots:
            try:
                _add_shell_application_items(collector, root)
            except Exception:
                logger.debug("Shell items failed for %s", root, exc_info=True)
            try:
                _add_executables_under(collector, root, "application_file", EXECUTABLE_SCAN_DEPTH)
            except Exception:
                logger.debug("Executable scan failed for %s", root, exc_info=True)

        try:
            steam_roots = _add_steam_games(collector)
        except Exception:
            logger.warning("Steam scan failed", exc_info=True)
            steam_roots = []

        try:
            _add_running_processes(collector, [*scan_roots, *steam_roots])
        except Exception:
            logger.warning("Process scan failed", exc_info=True)

        return collector.detected_apps()

    def get_frontmost_app(self) -> ActiveApp:
        handle = win32gui.GetForegroundWindow()
        _thread_id, process_id = win32process.GetWindowThreadProcessId(handle)
        if not process_id:
            raise RuntimeError("Could not read the active Windows app.")

        try:
            process = psutil.Process(process_id)
            executable_path = process.exe() or ""
            # PowerShell's ProcessName has no extension; keep the same display value.
            display_name = PurePath(process.name()).stem
        except psutil.Error as error:
            raise RuntimeError("Could not read the active Windows app.") from error

        if not display_name:
            raise RuntimeError("Could not read the active Windows app.")

        return ActiveApp(
            display_name=display_name,
            bundle_identifier=None,
            executable_name=PurePath(executable_path).name if executable_path else display_name,
            executable_path=executable_path or None,
        )

    def system_idle_seconds(self) -> float:
        # Both counters are 32-bit millisecond tick counts and wrap after ~49 days.
        elapsed_ms = (win32api.GetTickCount() - win32api.GetLastInputInfo()) & 0xFFFFFFFF
        return elapsed_ms / 1000.0

    def device_display_name(self) -> str:
        return socket.gethostname() or self.platform_label
