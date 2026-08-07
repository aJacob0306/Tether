from datetime import timedelta

import pytest

from fakes import FakeAdapter, FakeAuth, FakeDevices, RecordingSessions
from tether_desktop import paths, tracker as tracker_module
from tether_desktop.config import (
    TRACKING_IDLE_CLOSE_SECONDS,
    TRACKING_IDLE_GRACE_SECONDS,
    TRACKING_STATE_FILE,
    Config,
)
from tether_desktop.models import ActiveApp
from tether_desktop.timeutil import now, parse_iso, to_iso
from tether_desktop.tracker import Tracker, TrackerStatus

TETHER_A = "tether-a"
TETHER_B = "tether-b"


def target(**overrides):
    base = {
        "id": "target-1",
        "tether_id": TETHER_A,
        "value": "Cursor",
        "display_name": "Cursor",
        "bundle_identifier": "com.todesktop.cursor",
        "platform": "macos",
        "metadata": {},
    }
    base.update(overrides)
    return base


@pytest.fixture
def build(monkeypatch):
    def _build(targets=None, active_tether_id=TETHER_A, idle_seconds=0.0, active_app=None):
        fake_sessions = RecordingSessions(targets, active_tether_id)
        monkeypatch.setattr(tracker_module, "sessions", fake_sessions)
        adapter = FakeAdapter(active_app=active_app, idle_seconds=idle_seconds)
        statuses: list[TrackerStatus] = []
        instance = Tracker(
            supabase=object(),
            auth=FakeAuth(),
            devices=FakeDevices(),
            adapter=adapter,
            config=Config("https://x.supabase.co", "key", True),
            on_status=statuses.append,
        )
        return instance, fake_sessions, adapter, statuses

    return _build


def state():
    return paths.read_json(TRACKING_STATE_FILE) or {}


class TestNoMatch:
    def test_clears_active_app_when_nothing_matches(self, build):
        instance, fake, _, statuses = build(targets=[target(display_name="Slack", value="Slack",
                                                            bundle_identifier=None)])
        instance.sync_once()

        assert "clear_active_app" in fake.names()
        assert "start_session" not in fake.names()
        assert "No allowlisted app active (Cursor)." in [s.message for s in statuses]

    def test_prompts_to_pick_a_tether_when_none_is_active(self, build):
        instance, _, _, statuses = build(targets=[], active_tether_id=None)
        instance.sync_once()

        assert statuses[-1].message.startswith("Pick an active tether in the mobile app")

    def test_closes_an_open_session_when_the_user_switches_away(self, build):
        instance, fake, _, _ = build(targets=[target()])
        instance.sync_once()
        opened = state()["openSessionId"]

        fake.targets = []
        instance.sync_once()

        assert ("close", {"id": opened, "ended_at": None}) in fake.calls
        assert state()["openSessionId"] is None
        assert state()["targetKey"] is None


class TestSessionLifecycle:
    def test_starts_a_session_and_records_state(self, build):
        instance, fake, _, statuses = build(targets=[target()])
        instance.sync_once()

        assert fake.names() == [
            "fetch_targets", "fetch_active_tether", "start_session", "upsert_active_app",
        ]
        saved = state()
        assert saved["openSessionId"] == "session-1"
        assert saved["targetKey"] == f"com.todesktop.cursor:{TETHER_A}"
        assert saved["targetLabel"] == "Cursor"
        assert saved["tetherId"] == TETHER_A
        assert statuses[-1].message == "Tracking Cursor."

    def test_same_target_updates_instead_of_restarting(self, build):
        instance, fake, _, _ = build(targets=[target()])
        instance.sync_once()
        fake.calls.clear()

        instance.sync_once()

        assert "update_session" in fake.names()
        assert "start_session" not in fake.names()
        assert "close" not in fake.names()
        assert state()["openSessionId"] == "session-1"

    def test_switching_target_closes_then_starts(self, build):
        instance, fake, adapter, _ = build(
            targets=[target(), target(id="t2", value="Slack", display_name="Slack",
                            bundle_identifier="com.slack", tether_id=TETHER_A)]
        )
        instance.sync_once()
        fake.calls.clear()

        adapter.active_app = ActiveApp(display_name="Slack", bundle_identifier="com.slack")
        instance.sync_once()

        assert fake.names().index("close") < fake.names().index("start_session")
        assert state()["targetLabel"] == "Slack"
        assert state()["openSessionId"] == "session-2"

    def test_same_app_in_a_different_tether_restarts_the_session(self, build):
        """targetKey includes the tether, so re-attribution must open a new session."""
        instance, fake, _, _ = build(targets=[target()])
        instance.sync_once()
        fake.calls.clear()

        fake.targets = [target(tether_id=TETHER_B)]
        fake.active_tether_id = TETHER_B
        instance.sync_once()

        assert "close" in fake.names()
        assert "start_session" in fake.names()
        assert state()["targetKey"] == f"com.todesktop.cursor:{TETHER_B}"

    def test_session_started_at_prefers_the_value_from_the_database(self, build):
        instance, fake, _, _ = build(targets=[target()])
        fake.started_at_override = "2026-01-01T00:00:00.000Z"
        instance.sync_once()

        assert state()["sessionStartedAt"] == "2026-01-01T00:00:00.000Z"


class TestIdle:
    def test_idle_closes_the_session_and_clears_the_active_app(self, build):
        instance, fake, adapter, statuses = build(targets=[target()])
        instance.sync_once()
        fake.calls.clear()

        adapter.idle_seconds = TRACKING_IDLE_CLOSE_SECONDS + 60
        instance.sync_once()

        assert "close" in fake.names()
        assert "clear_active_app" in fake.names()
        assert statuses[-1].message == "Tracking paused: Mac is idle."
        assert state()["openSessionId"] is None

    def test_just_below_the_threshold_keeps_tracking(self, build):
        instance, fake, adapter, _ = build(targets=[target()])
        adapter.idle_seconds = TRACKING_IDLE_CLOSE_SECONDS - 1
        instance.sync_once()

        assert "start_session" in fake.names()

    def test_end_time_is_the_grace_period_after_input_stopped(self, build):
        instance, fake, adapter, _ = build(targets=[target()])
        # Start the session well in the past so the "never before the start" clamp
        # does not mask the grace-period calculation being tested here.
        fake.started_at_override = to_iso(now() - timedelta(hours=2))
        instance.sync_once()

        idle_for = TRACKING_IDLE_CLOSE_SECONDS + 300
        adapter.idle_seconds = idle_for
        before = now()
        instance.sync_once()

        ended_at = parse_iso(
            next(payload["ended_at"] for name, payload in fake.calls if name == "close")
        )
        expected = before - timedelta(seconds=idle_for - TRACKING_IDLE_GRACE_SECONDS)
        assert abs((ended_at - expected).total_seconds()) < 2

    def test_end_time_never_precedes_the_session_start(self, build):
        instance, fake, adapter, _ = build(targets=[target()])
        started = to_iso(now() - timedelta(seconds=5))
        fake.started_at_override = started
        instance.sync_once()

        adapter.idle_seconds = 3600
        instance.sync_once()

        ended_at = next(payload["ended_at"] for name, payload in fake.calls if name == "close")
        assert parse_iso(ended_at) == parse_iso(started)


class TestNotifications:
    def test_notifies_peers_when_a_session_starts(self, build, monkeypatch):
        sent = []
        monkeypatch.setattr(
            tracker_module, "notify_peers_started_app",
            lambda config, token, target: sent.append(target["display_name"]),
        )
        instance, _, _, _ = build(targets=[target()])
        instance.sync_once()

        assert sent == ["Cursor"]

    def test_a_failing_notification_does_not_break_the_tick(self, build, monkeypatch):
        def boom(*_args):
            raise RuntimeError("push is down")

        monkeypatch.setattr(tracker_module, "notify_peers_started_app", boom)
        instance, _, _, statuses = build(targets=[target()])
        instance.sync_once()

        assert statuses[-1].message == "Tracking Cursor."
        assert state()["openSessionId"] == "session-1"

    def test_updating_an_existing_session_does_not_re_notify(self, build, monkeypatch):
        sent = []
        monkeypatch.setattr(
            tracker_module, "notify_peers_started_app", lambda *a: sent.append(1)
        )
        instance, _, _, _ = build(targets=[target()])
        instance.sync_once()
        instance.sync_once()

        assert len(sent) == 1

    def test_the_push_cooldown_survives_a_session_close(self, build):
        instance, fake, _, _ = build(targets=[target()])
        instance.sync_once()
        paths.write_json(TRACKING_STATE_FILE, {**state(), "lastNotifyAt": 1234567})

        fake.targets = []
        instance.sync_once()

        assert state()["lastNotifyAt"] == 1234567


class TestFlushAndStop:
    def test_flush_close_ends_an_open_session(self, build):
        instance, fake, _, statuses = build(targets=[target()])
        instance.sync_once()
        fake.calls.clear()

        instance.flush_close("quitting")

        assert "close" in fake.names()
        assert "clear_active_app" in fake.names()
        assert statuses[-1].message == "Tracking paused: quitting."

    def test_flush_close_without_a_session_only_reports(self, build):
        instance, fake, _, statuses = build(targets=[])
        instance.flush_close("quitting")

        assert fake.calls == []
        assert statuses[-1].message == "Tracking paused: quitting."

    def test_heartbeat_runs_every_tick(self, build):
        instance, _, _, _ = build(targets=[target()])
        instance.sync_once()
        instance.sync_once()

        assert instance._devices.heartbeats == 2

    def test_loop_starts_and_stops(self, build):
        instance, _, _, _ = build(targets=[target()])
        instance.start()
        assert instance.is_running
        instance.stop()
        assert not instance.is_running
