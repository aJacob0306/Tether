from tether_desktop.matching import (
    app_match_key,
    executable_base_name,
    matches_allowed_app,
    normalize_match_value,
    normalize_path_value,
    resolve_allowed_app,
)
from tether_desktop.models import ActiveApp

TETHER_A = "11111111-1111-1111-1111-111111111111"
TETHER_B = "22222222-2222-2222-2222-222222222222"


def target(**overrides):
    base = {
        "id": "target-1",
        "tether_id": TETHER_A,
        "value": "Cursor",
        "display_name": "Cursor",
        "bundle_identifier": None,
        "platform": "macos",
        "metadata": {},
    }
    base.update(overrides)
    return base


class TestNormalizers:
    def test_normalize_match_value_trims_and_lowercases(self):
        assert normalize_match_value("  Cursor  ") == "cursor"

    def test_normalize_match_value_handles_none(self):
        assert normalize_match_value(None) == ""

    def test_executable_base_name_strips_directories_and_exe(self):
        assert executable_base_name(r"C:\Program Files\Cursor\Cursor.exe") == "cursor"
        assert executable_base_name("/Applications/Cursor.app") == "cursor.app"
        assert executable_base_name("Code.exe") == "code"

    def test_executable_base_name_only_strips_trailing_exe(self):
        assert executable_base_name("exeter") == "exeter"

    def test_normalize_path_value_uses_backslashes(self):
        assert normalize_path_value("C:/Games/Steam/app.exe") == r"c:\games\steam\app.exe"


class TestAppMatchKey:
    def test_prefers_bundle_identifier(self):
        assert app_match_key(target(bundle_identifier="com.todesktop.x")) == "com.todesktop.x"

    def test_falls_back_through_metadata_then_names(self):
        assert app_match_key(target(metadata={"installPath": "/Applications/Cursor.app"})) == (
            "/Applications/Cursor.app"
        )
        assert app_match_key(target(metadata={"executable": "Cursor.exe"})) == "Cursor.exe"
        assert app_match_key(target(display_name="Cursor")) == "Cursor"

    def test_falls_back_to_id_when_everything_else_is_empty(self):
        empty = target(value="", display_name="", bundle_identifier="", metadata={})
        assert app_match_key(empty) == "target-1"


class TestMatchesAllowedApp:
    def test_matches_on_bundle_identifier(self):
        active = ActiveApp(display_name="Totally Different", bundle_identifier="com.microsoft.VSCode")
        assert matches_allowed_app(active, target(bundle_identifier="com.microsoft.VSCode"))

    def test_blank_bundle_identifiers_do_not_match_each_other(self):
        active = ActiveApp(display_name="Ghost", bundle_identifier=None)
        assert not matches_allowed_app(active, target(display_name="Other", value="Other"))

    def test_matches_on_display_name(self):
        assert matches_allowed_app(ActiveApp(display_name="Cursor"), target())

    def test_matches_on_executable_name_against_target_metadata(self):
        active = ActiveApp(display_name="Code", executable_name="Code.exe")
        entry = target(display_name="Visual Studio Code", value="Visual Studio Code",
                       metadata={"executable": "Code.exe"})
        assert matches_allowed_app(active, entry)

    def test_matches_on_executable_path(self):
        active = ActiveApp(
            display_name="Unknown",
            executable_name="launcher.exe",
            executable_path=r"C:\Program Files\Cursor\Cursor.exe",
        )
        entry = target(display_name="Nope", value="Nope",
                       metadata={"installPath": "C:/Program Files/Cursor/Cursor.exe"})
        assert matches_allowed_app(active, entry)

    def test_does_not_match_unrelated_app(self):
        assert not matches_allowed_app(ActiveApp(display_name="Slack"), target())

    def test_missing_metadata_is_safe(self):
        assert not matches_allowed_app(ActiveApp(display_name="Slack"), target(metadata=None))


class TestResolveAllowedApp:
    def test_returns_none_when_nothing_matches(self):
        assert resolve_allowed_app(ActiveApp(display_name="Slack"), [target()], TETHER_A) is None

    def test_resolves_single_tether_without_active_tether(self):
        resolved = resolve_allowed_app(ActiveApp(display_name="Cursor"), [target()], None)
        assert resolved is not None
        assert resolved["resolved_tether_id"] == TETHER_A

    def test_active_tether_disambiguates_multiple_tethers(self):
        targets = [target(id="a", tether_id=TETHER_A), target(id="b", tether_id=TETHER_B)]
        resolved = resolve_allowed_app(ActiveApp(display_name="Cursor"), targets, TETHER_B)
        assert resolved is not None
        assert resolved["resolved_tether_id"] == TETHER_B
        assert resolved["id"] == "b"

    def test_ambiguous_tethers_without_active_tether_are_skipped(self):
        targets = [target(id="a", tether_id=TETHER_A), target(id="b", tether_id=TETHER_B)]
        assert resolve_allowed_app(ActiveApp(display_name="Cursor"), targets, None) is None

    def test_active_tether_not_among_matches_is_skipped(self):
        targets = [target(id="a", tether_id=TETHER_A), target(id="b", tether_id=TETHER_B)]
        unrelated = "33333333-3333-3333-3333-333333333333"
        assert resolve_allowed_app(ActiveApp(display_name="Cursor"), targets, unrelated) is None

    def test_targets_without_a_tether_do_not_resolve(self):
        assert resolve_allowed_app(ActiveApp(display_name="Cursor"), [target(tether_id=None)], None) is None

    def test_does_not_mutate_the_input_target(self):
        entry = target()
        resolve_allowed_app(ActiveApp(display_name="Cursor"), [entry], None)
        assert "resolved_tether_id" not in entry
