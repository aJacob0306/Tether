"""macOS adapter.

Ports `src/platform/darwin.js`. Two things are simpler here than in the Electron
version: `plistlib` reads `Info.plist` directly instead of shelling out to `plutil`,
and `NSWorkspace` reports the frontmost app without the AppleScript round trip that
made macOS ask for Accessibility permission.
"""

from __future__ import annotations

import base64
import io
import logging
import socket
from pathlib import Path
from plistlib import InvalidFileException
from typing import Any

import plistlib

from AppKit import NSWorkspace
from PIL import Image, UnidentifiedImageError
from Quartz import (
    CGEventSourceSecondsSinceLastEventType,
    kCGAnyInputEventType,
    kCGEventSourceStateCombinedSessionState,
)

from ..models import ActiveApp, DetectedApp

logger = logging.getLogger(__name__)

APP_DISCOVERY_ROOTS = [Path("/Applications"), Path.home() / "Applications"]
MAX_DISCOVERY_DEPTH = 3
ICON_SIZE = 64


class DarwinAdapter:
    platform_id = "macos"
    platform_label = "Mac"

    def detect_installed_apps(self) -> list[DetectedApp]:
        # Ordered de-duplication matters: two bundles can share a CFBundleIdentifier
        # (several Python releases each ship org.python.IDLE), and the last one scanned
        # wins. An unordered set would make that winner vary between runs.
        discovered: list[Path] = []
        for root in APP_DISCOVERY_ROOTS:
            discovered.extend(_find_app_bundles(root))
        bundle_paths = list(dict.fromkeys(discovered))

        apps_by_key: dict[str, DetectedApp] = {}
        for bundle_path in bundle_paths:
            plist = _read_info_plist(bundle_path)
            detected = _normalize_app_bundle(bundle_path, plist)
            if not detected["value"]:
                continue
            detected["metadata"]["iconDataUrl"] = _icon_data_url(bundle_path, plist)
            apps_by_key[detected["tool_key"]] = detected

        return sorted(apps_by_key.values(), key=lambda app: app["display_name"].lower())

    def get_frontmost_app(self) -> ActiveApp:
        running = NSWorkspace.sharedWorkspace().frontmostApplication()
        display_name = (running.localizedName() if running else None) or ""
        display_name = display_name.strip()

        if not display_name:
            raise RuntimeError("Could not read the active macOS app.")

        bundle_identifier = (running.bundleIdentifier() or "").strip()
        return ActiveApp(
            display_name=display_name,
            bundle_identifier=bundle_identifier or None,
            executable_name=None,
        )

    def system_idle_seconds(self) -> float:
        return float(
            CGEventSourceSecondsSinceLastEventType(
                kCGEventSourceStateCombinedSessionState, kCGAnyInputEventType
            )
        )

    def device_display_name(self) -> str:
        return socket.gethostname() or self.platform_label


def _find_app_bundles(directory: Path, depth: int = 0) -> list[Path]:
    """Collect `.app` bundles, sorted so repeated scans agree with each other.

    `is_dir()` follows symlinks, which is how Safari gets found: `/Applications/Safari.app`
    is a link into the Cryptexes volume, and the Electron scanner skipped it because
    Node reports a symlink as not-a-directory.
    """
    if depth > MAX_DISCOVERY_DEPTH:
        return []

    try:
        entries = sorted(directory.iterdir())
    except OSError:
        return []

    found: list[Path] = []
    for entry in entries:
        if not entry.is_dir():
            continue
        if entry.name.endswith(".app"):
            found.append(entry)
            continue
        found.extend(_find_app_bundles(entry, depth + 1))

    return found


def _read_info_plist(app_path: Path) -> dict[str, Any]:
    try:
        return plistlib.loads((app_path / "Contents" / "Info.plist").read_bytes())
    except (OSError, InvalidFileException, ValueError):
        return {}


def _resolve_icon_path(app_path: Path, plist: dict[str, Any]) -> Path | None:
    icon_file = plist.get("CFBundleIconFile")
    if not isinstance(icon_file, str) or not icon_file:
        return None

    resources = app_path / "Contents" / "Resources"
    for candidate in (resources / icon_file, resources / f"{icon_file}.icns"):
        if candidate.exists():
            return candidate

    return None


def _icon_data_url(app_path: Path, plist: dict[str, Any]) -> str | None:
    """Render the app icon as a PNG data URL.

    Apps that ship icons inside `Assets.car` have no `.icns` to read, so they get no
    icon here — the same outcome as the Electron version.
    """
    icon_path = _resolve_icon_path(app_path, plist)
    if not icon_path:
        return None

    try:
        with Image.open(icon_path) as icon:
            icon.load()
            resized = icon.convert("RGBA").resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
            buffer = io.BytesIO()
            resized.save(buffer, format="PNG")
    except (OSError, UnidentifiedImageError, ValueError):
        logger.debug("Could not read icon for %s", app_path, exc_info=True)
        return None

    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _normalize_app_bundle(app_path: Path, plist: dict[str, Any]) -> DetectedApp:
    display_name = str(
        plist.get("CFBundleDisplayName")
        or plist.get("CFBundleName")
        or plist.get("CFBundleExecutable")
        or app_path.name.removesuffix(".app").strip()
    ).strip()
    bundle_identifier = plist.get("CFBundleIdentifier") or None
    tool_key = f"bundle:{bundle_identifier}" if bundle_identifier else f"path:{app_path}"

    return {
        "tool_type": "app",
        "value": display_name,
        "display_name": display_name,
        "tool_key": tool_key,
        "bundle_identifier": bundle_identifier,
        "install_path": str(app_path),
        "platform": DarwinAdapter.platform_id,
        "metadata": {
            "bundleName": plist.get("CFBundleName"),
            "executable": plist.get("CFBundleExecutable"),
            "version": plist.get("CFBundleShortVersionString") or plist.get("CFBundleVersion"),
        },
    }
