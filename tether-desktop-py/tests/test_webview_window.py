"""Webview window tests.

The window's job is to turn service calls into a state dict for the front end, so these
drive it with a stub service and assert on that dict. No display or webview runtime is
needed, which keeps the suite runnable in CI.
"""

import pytest

from tether_desktop.models import SyncResult
from tether_desktop.tracker import TrackerStatus
from tether_desktop.ui import webview_window
from tether_desktop.ui.webview_window import TetherWindow, describe_sync


class StubAdapter:
    def __init__(self, apps=None):
        self.apps = apps if apps is not None else []
        self.scan_count = 0

    def detect_installed_apps(self):
        self.scan_count += 1
        return self.apps


class StubService:
    """Stands in for TetherService with no Supabase or OS access."""

    def __init__(self, **overrides):
        self.adapter = StubAdapter(overrides.pop("apps", None))
        self.signed_in_email = overrides.pop("email", None)
        self.device_name = overrides.pop("device_name", "Test Machine")
        self.tracking = overrides.pop(
            "tracking", {"last_status": "Idle.", "tone": "idle", "target_label": None}
        )
        self.raises = overrides.pop("raises", {})
        self.calls = []
        self.shutdown_reason = None

    def _maybe_raise(self, name):
        if name in self.raises:
            raise self.raises[name]

    def bootstrap(self):
        self.calls.append("bootstrap")
        self._maybe_raise("bootstrap")
        return bool(self.signed_in_email)

    def get_status(self):
        return {
            "session": {"email": self.signed_in_email} if self.signed_in_email else None,
            "device": {"display_name": self.device_name},
            "offline_reason": None,
            "tracking": self.tracking,
        }

    def sign_in(self, email, password):
        self.calls.append(("sign_in", email, password))
        self._maybe_raise("sign_in")
        self.signed_in_email = email
        return {
            "session": {"email": email},
            "device": {"display_name": self.device_name},
            "sync": SyncResult(detected_count=9, uploaded_count=8, synced_at="now"),
        }

    def sync_detected_apps(self):
        self.calls.append("sync")
        self._maybe_raise("sync")
        return SyncResult(detected_count=4, uploaded_count=3, synced_at="now")

    def sign_out(self):
        self.calls.append("sign_out")
        self._maybe_raise("sign_out")
        self.signed_in_email = None

    def shutdown(self, reason=""):
        self.shutdown_reason = reason


@pytest.fixture
def build(monkeypatch):
    """A window wired to a stub service, with TetherService construction bypassed."""

    def _build(**overrides):
        service = StubService(**overrides)
        monkeypatch.setattr(webview_window, "TetherService", lambda **_kwargs: service)
        window = TetherWindow()
        return window, service

    return _build


class TestDescribeSync:
    def test_pluralises_correctly(self):
        assert describe_sync(SyncResult(1, 1, "now")) == "Synced 1 app (1 detected)."
        assert describe_sync(SyncResult(9, 5, "now")) == "Synced 5 apps (9 detected)."


class TestInitialState:
    def test_signed_out_asks_the_user_to_sign_in(self, build):
        window, _ = build(email=None)

        state = window.load_initial_state()

        assert state["email"] is None
        assert "Sign in" in state["status"]
        assert state["status_is_error"] is False

    def test_signed_in_reports_the_account_and_device(self, build):
        window, _ = build(email="a@b.c", device_name="Machine")

        state = window.load_initial_state()

        assert state["email"] == "a@b.c"
        assert state["device_name"] == "Machine"

    def test_carries_the_tracking_tone_through(self, build):
        window, _ = build(
            email="a@b.c",
            tracking={"last_status": "Tracking Cursor.", "tone": "working", "target_label": "Cursor"},
        )

        state = window.load_initial_state()

        assert state["tracking"] == "Tracking Cursor."
        assert state["tracking_tone"] == "working"
        assert state["tracking_target"]["label"] == "Cursor"

    def test_a_network_failure_is_reported_not_raised(self, build):
        from tether_desktop.auth import SessionUnavailableError

        window, _ = build(raises={"bootstrap": SessionUnavailableError("Supabase unreachable")})

        state = window.load_initial_state()

        assert state["status"] == "Supabase unreachable"
        assert state["status_is_error"] is True

    def test_a_startup_error_disables_the_window(self, monkeypatch):
        from tether_desktop.config import ConfigError

        def explode(**_kwargs):
            raise ConfigError("Set SUPABASE_URL")

        monkeypatch.setattr(webview_window, "TetherService", explode)
        state = TetherWindow().load_initial_state()

        assert state["status"] == "Set SUPABASE_URL"
        assert state["status_is_error"] is True


class TestActions:
    def test_sign_in_reports_the_sync_result(self, build):
        window, service = build()

        state = window.sign_in("a@b.c", "secret")

        assert ("sign_in", "a@b.c", "secret") in service.calls
        assert state["email"] == "a@b.c"
        assert state["status"] == "Synced 8 apps (9 detected)."
        assert state["synced_count"] == 8

    def test_sign_in_failure_lands_in_the_status_line(self, build):
        window, _ = build(raises={"sign_in": RuntimeError("Invalid login credentials")})

        state = window.sign_in("a@b.c", "wrong")

        assert state["status"] == "Invalid login credentials"
        assert state["status_is_error"] is True
        assert state["email"] is None

    def test_an_error_with_no_message_still_says_something(self, build):
        window, _ = build(raises={"sync": RuntimeError()})

        assert window.sync()["status"] == "RuntimeError"

    def test_sync_updates_the_count(self, build):
        window, _ = build(email="a@b.c")

        state = window.sync()

        assert state["status"] == "Synced 3 apps (4 detected)."
        assert state["synced_count"] == 3

    def test_sign_out_clears_the_view(self, build):
        window, _ = build(email="a@b.c")
        window.load_initial_state()

        state = window.sign_out()

        assert state["email"] is None
        assert state["device_name"] is None
        assert state["synced_count"] is None
        assert state["tracking_tone"] == "offline"
        assert state["tracking_target"] is None

    def test_closing_the_window_closes_the_session(self, build):
        window, service = build(email="a@b.c")

        window._on_closing()

        assert service.shutdown_reason == "Desktop companion is quitting"


class TestTrackerStatus:
    def test_working_status_carries_a_tone_and_target(self, build):
        window, _ = build(email="a@b.c")

        window._on_tracker_status(TrackerStatus("Tracking Cursor.", "working", "Cursor"))

        assert window._state["tracking"] == "Tracking Cursor."
        assert window._state["tracking_tone"] == "working"
        assert window._state["tracking_target"]["label"] == "Cursor"

    def test_status_without_a_target_clears_it(self, build):
        window, _ = build(email="a@b.c")
        window._on_tracker_status(TrackerStatus("Tracking Cursor.", "working", "Cursor"))

        window._on_tracker_status(TrackerStatus("Mac is idle.", "idle"))

        assert window._state["tracking_target"] is None
        assert window._state["tracking_tone"] == "idle"

    def test_pushing_without_a_window_is_harmless(self, build):
        window, _ = build(email="a@b.c")

        window._on_tracker_status(TrackerStatus("Tracking Cursor.", "working", "Cursor"))  # no raise


class TestIconLookup:
    APPS = [
        {"display_name": "Cursor", "metadata": {"iconDataUrl": "data:image/png;base64,AAA"}},
        {"display_name": "NoIcon", "metadata": {}},
        {"display_name": "NoMeta"},
    ]

    def test_finds_the_icon_for_a_tracked_app(self, build):
        window, _ = build(apps=self.APPS)

        assert window._icon_for("Cursor") == "data:image/png;base64,AAA"

    def test_apps_without_an_icon_are_skipped(self, build):
        window, _ = build(apps=self.APPS)

        assert window._icon_for("NoIcon") is None
        assert window._icon_for("NoMeta") is None
        assert window._icon_for("Unknown") is None

    def test_the_scan_is_cached_because_the_tracker_asks_every_poll(self, build):
        window, service = build(apps=self.APPS)

        for _ in range(5):
            window._icon_for("Cursor")

        assert service.adapter.scan_count == 1

    def test_a_sync_invalidates_the_cache(self, build):
        window, service = build(apps=self.APPS)
        window._icon_for("Cursor")

        window.sync()
        window._icon_for("Cursor")

        assert service.adapter.scan_count == 2

    def test_a_failing_scan_does_not_break_the_window(self, build):
        window, service = build(apps=self.APPS)
        service.adapter.detect_installed_apps = lambda: (_ for _ in ()).throw(OSError("nope"))

        assert window._icon_for("Cursor") is None
