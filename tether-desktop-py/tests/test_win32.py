"""Tests for the Windows adapter's pure helpers.

These run on any operating system because `platforms/win32.py` defers its Windows-only
imports. The adapter class itself still needs verifying on real hardware.
"""

import pytest

from tether_desktop.platforms.win32 import (
    AppCollector,
    executable_from_command,
    find_main_executable,
    is_helper_path,
    is_ignored_executable_name,
    is_launcher_url,
    iter_files,
    normalize_windows_app,
    parse_steam_libraries,
    parse_url_shortcut,
)


class TestIgnoredExecutableNames:
    @pytest.mark.parametrize(
        "name",
        ["unins000.exe", "UNINS000.EXE", "setup.exe", "updater.exe", "crashpad_handler.exe",
         "squirrel.exe", "maintenancetool.exe"],
    )
    def test_known_installer_names_are_ignored(self, name):
        assert is_ignored_executable_name(name)

    @pytest.mark.parametrize(
        "name",
        ["my-installer.exe", "app_uninstall.exe", "game patcher.exe", "installer.exe",
         "update.exe", "SomeApp-Updater.exe"],
    )
    def test_installer_like_names_are_ignored(self, name):
        assert is_ignored_executable_name(name)

    @pytest.mark.parametrize(
        "name", ["Code.exe", "cursor.exe", "Discord.exe", "chrome.exe", "Photoshop.exe"]
    )
    def test_real_apps_are_kept(self, name):
        assert not is_ignored_executable_name(name)

    def test_empty_names_are_ignored(self):
        assert is_ignored_executable_name(None)
        assert is_ignored_executable_name("")

    def test_a_word_merely_containing_install_is_kept(self):
        assert not is_ignored_executable_name("Installatron Suite.exe")


class TestHelperPaths:
    @pytest.mark.parametrize(
        "path",
        [r"\resources\app.exe", r"\bin\tool.exe", r"\node_modules\x.exe", r"\locales\y.exe",
         r"\swiftshader\z.exe", r"\Crashpad\handler.exe", r"\vc_redist\setup.exe"],
    )
    def test_helper_directories_are_detected(self, path):
        assert is_helper_path(path)

    @pytest.mark.parametrize("path", [r"\Microsoft VS Code\Code.exe", r"\Cursor\Cursor.exe"])
    def test_normal_app_paths_are_not_helpers(self, path):
        assert not is_helper_path(path)

    def test_the_pattern_is_a_valid_regex(self):
        """The PowerShell original was invalid and silently disabled three scan sources."""
        assert is_helper_path(r"C:\App\resources\thing.exe") is True

    def test_requires_a_full_path_segment(self):
        assert not is_helper_path(r"\binary\app.exe")
        assert not is_helper_path(r"\plugins2\app.exe")

    def test_forward_slashes_also_match(self):
        assert is_helper_path("/app/resources/thing.exe")


class TestExecutableFromCommand:
    def test_reads_a_quoted_path(self):
        assert executable_from_command('"C:\\Program Files\\App\\app.exe" --flag') == (
            "C:\\Program Files\\App\\app.exe"
        )

    def test_reads_an_unquoted_path_with_arguments(self):
        assert executable_from_command(r"C:\App\app.exe,0") == r"C:\App\app.exe"

    def test_reads_a_bare_path(self):
        assert executable_from_command(r"C:\App\app.exe") == r"C:\App\app.exe"

    def test_falls_back_to_the_first_token(self):
        assert executable_from_command("someprogram --flag") == "someprogram"

    def test_handles_empty_input(self):
        assert executable_from_command(None) is None
        assert executable_from_command("   ") is None

    def test_expands_environment_variables(self, monkeypatch):
        monkeypatch.setenv("MYAPPDIR", r"C:\Apps")
        assert executable_from_command(r"%MYAPPDIR%\app.exe") == r"C:\Apps\app.exe"


class TestUrlShortcuts:
    def test_reads_the_url_line(self):
        assert parse_url_shortcut("[InternetShortcut]\nURL=steam://rungameid/440\n") == (
            "steam://rungameid/440"
        )

    def test_returns_none_without_a_url(self):
        assert parse_url_shortcut("[InternetShortcut]\nIconIndex=0\n") is None

    def test_last_url_wins(self):
        assert parse_url_shortcut("URL=a://1\nURL=b://2\n") == "b://2"

    @pytest.mark.parametrize(
        "url",
        ["steam://rungameid/440", "com.epicgames.launcher://apps/x", "uplay://launch/1",
         "origin://game/2", "goggalaxy://x", "battlenet://WoW"],
    )
    def test_known_launchers_are_accepted(self, url):
        assert is_launcher_url(url)

    @pytest.mark.parametrize("url", ["https://example.com", "file:///c:/x", None, ""])
    def test_other_urls_are_rejected(self, url):
        assert not is_launcher_url(url)


class TestSteamLibraries:
    def test_extracts_library_paths(self):
        vdf = '''
        "libraryfolders"
        {
            "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" }
            "1" { "path" "D:\\\\SteamLibrary" }
        }
        '''
        assert parse_steam_libraries(vdf) == [
            r"C:\Program Files (x86)\Steam",
            r"D:\SteamLibrary",
        ]

    def test_no_paths_yields_empty_list(self):
        assert parse_steam_libraries('"libraryfolders" { }') == []


class TestNormalizeWindowsApp:
    def test_builds_a_detected_tools_row(self):
        row = normalize_windows_app(
            {"name": "  Cursor  ", "executable": "Cursor.exe",
             "path": r"C:\Users\me\AppData\Local\Cursor\Cursor.exe", "source": "registry"}
        )
        assert row["display_name"] == "Cursor"
        assert row["tool_key"] == r"path:c:\users\me\appdata\local\cursor\cursor.exe"
        assert row["platform"] == "windows"
        assert row["bundle_identifier"] is None
        assert row["metadata"] == {"executable": "Cursor.exe", "source": "registry"}

    def test_requires_a_name_and_a_path(self):
        assert normalize_windows_app({"name": "", "path": r"C:\x.exe"}) is None
        assert normalize_windows_app({"name": "App", "path": ""}) is None

    def test_shape_matches_the_macos_adapter(self):
        row = normalize_windows_app({"name": "App", "path": r"C:\App\app.exe"})
        assert set(row) == {
            "tool_type", "value", "display_name", "tool_key",
            "bundle_identifier", "install_path", "platform", "metadata",
        }


class TestAppCollector:
    def test_first_entry_for_a_path_wins(self, tmp_path):
        exe = tmp_path / "App.exe"
        exe.write_bytes(b"x")
        collector = AppCollector()
        collector.add_executable("First", str(exe), "registry")
        collector.add_executable("Second", str(exe), "shortcut")

        apps = collector.detected_apps()

        assert len(apps) == 1
        assert apps[0]["display_name"] == "First"
        assert apps[0]["metadata"]["source"] == "registry"

    def test_skips_non_executables_and_missing_files(self, tmp_path):
        collector = AppCollector()
        collector.add_executable("Doc", str(tmp_path / "readme.txt"), "x")
        collector.add_executable("Ghost", str(tmp_path / "missing.exe"), "x")

        assert collector.detected_apps() == []

    def test_skips_installers(self, tmp_path):
        setup = tmp_path / "setup.exe"
        setup.write_bytes(b"x")
        collector = AppCollector()
        collector.add_executable("Setup", str(setup), "x")

        assert collector.detected_apps() == []

    def test_launcher_urls_are_collected(self):
        collector = AppCollector()
        collector.add_launcher_url("Team Fortress 2", "steam://rungameid/440", "url_shortcut")

        apps = collector.detected_apps()

        assert len(apps) == 1
        assert apps[0]["display_name"] == "Team Fortress 2"
        assert apps[0]["install_path"] == "steam://rungameid/440"

    def test_non_launcher_urls_are_dropped(self):
        collector = AppCollector()
        collector.add_launcher_url("Docs", "https://example.com", "url_shortcut")

        assert collector.detected_apps() == []

    def test_output_is_sorted_by_display_name(self, tmp_path):
        collector = AppCollector()
        for name in ["Zeta", "alpha", "Mid"]:
            exe = tmp_path / f"{name}.exe"
            exe.write_bytes(b"x")
            collector.add_executable(name, str(exe), "x")

        assert [app["display_name"] for app in collector.detected_apps()] == ["alpha", "Mid", "Zeta"]


class TestIterFiles:
    def test_respects_the_depth_limit(self, tmp_path):
        (tmp_path / "a" / "b" / "c").mkdir(parents=True)
        (tmp_path / "top.exe").write_bytes(b"")
        (tmp_path / "a" / "one.exe").write_bytes(b"")
        (tmp_path / "a" / "b" / "two.exe").write_bytes(b"")
        (tmp_path / "a" / "b" / "c" / "three.exe").write_bytes(b"")

        found = {p.name for p in iter_files(tmp_path, ".exe", max_depth=2)}

        assert found == {"top.exe", "one.exe", "two.exe"}

    def test_filters_by_suffix(self, tmp_path):
        (tmp_path / "a.exe").write_bytes(b"")
        (tmp_path / "b.txt").write_bytes(b"")

        assert [p.name for p in iter_files(tmp_path, ".exe", 1)] == ["a.exe"]

    def test_missing_directory_is_not_an_error(self, tmp_path):
        assert list(iter_files(tmp_path / "nope", ".exe", 3)) == []


class TestFindMainExecutable:
    def test_prefers_an_executable_named_after_the_folder(self, tmp_path):
        app_dir = tmp_path / "Cursor"
        app_dir.mkdir()
        (app_dir / "Cursor.exe").write_bytes(b"x" * 10)
        (app_dir / "helper.exe").write_bytes(b"x" * 5000)

        assert find_main_executable(app_dir).endswith("Cursor.exe")

    def test_skips_helper_directories(self, tmp_path):
        app_dir = tmp_path / "Game"
        (app_dir / "resources").mkdir(parents=True)
        (app_dir / "resources" / "Game.exe").write_bytes(b"x" * 9999)
        (app_dir / "Launcher.exe").write_bytes(b"x")

        assert find_main_executable(app_dir).endswith("Launcher.exe")

    def test_prefers_shallower_then_larger_files(self, tmp_path):
        app_dir = tmp_path / "Thing"
        (app_dir / "sub").mkdir(parents=True)
        (app_dir / "sub" / "big.exe").write_bytes(b"x" * 9999)
        (app_dir / "small.exe").write_bytes(b"x")
        (app_dir / "bigger.exe").write_bytes(b"x" * 500)

        assert find_main_executable(app_dir).endswith("bigger.exe")

    def test_skips_installers(self, tmp_path):
        app_dir = tmp_path / "Thing"
        app_dir.mkdir()
        (app_dir / "setup.exe").write_bytes(b"x" * 9999)

        assert find_main_executable(app_dir) is None

    def test_missing_directory_yields_none(self, tmp_path):
        assert find_main_executable(tmp_path / "nope") is None
