"""Test doubles for the tracker's collaborators."""

from __future__ import annotations

from typing import Any

from tether_desktop.models import ActiveApp


class FakeAdapter:
    platform_id = "macos"
    platform_label = "Mac"

    def __init__(self, active_app: ActiveApp | None = None, idle_seconds: float = 0.0):
        self.active_app = active_app or ActiveApp(display_name="Cursor")
        self.idle_seconds = idle_seconds
        self.installed_apps: list[dict[str, Any]] = []

    def detect_installed_apps(self):
        return self.installed_apps

    def get_frontmost_app(self):
        return self.active_app

    def system_idle_seconds(self):
        return self.idle_seconds

    def device_display_name(self):
        return "Test Machine"


class FakeAuth:
    def __init__(self, user_id: str = "user-1"):
        self._user_id = user_id
        self.session = {"user": {"id": user_id, "email": "a@b.c"}, "access_token": "token"}

    def ensure_session(self):
        return self.session

    def user_id(self):
        return self._user_id

    def access_token(self):
        return "token"

    def public_session(self):
        return {"email": "a@b.c", "user_id": self._user_id}


class FakeDevices:
    def __init__(self):
        self.device = {"id": "device-1", "display_name": "Test Machine"}
        self.heartbeats = 0

    def touch_heartbeat_if_needed(self):
        self.heartbeats += 1

    def register(self):
        return self.device

    def ensure_registered(self):
        return self.device

    def clear(self):
        self.device = None


class RecordingSessions:
    """Stands in for the `sessions` module, recording every call the tracker makes."""

    def __init__(self, targets: list[dict[str, Any]] | None = None, active_tether_id: str | None = None):
        self.targets = targets or []
        self.active_tether_id = active_tether_id
        self.calls: list[tuple[str, Any]] = []
        self.open_session: dict[str, Any] | None = None
        self._next_id = 0
        self.started_at_override: str | None = None

    def _record(self, name: str, payload: Any = None) -> None:
        self.calls.append((name, payload))

    def names(self) -> list[str]:
        return [name for name, _ in self.calls]

    def fetch_allowed_app_targets(self, _supabase):
        self._record("fetch_targets")
        return self.targets

    def fetch_active_tether_id(self, _supabase):
        self._record("fetch_active_tether")
        return self.active_tether_id

    def close_work_session(self, _supabase, session_id, ended_at=None):
        self._record("close", {"id": session_id, "ended_at": ended_at})

    def clear_desktop_active_app(self, _supabase, user_id):
        self._record("clear_active_app", user_id)

    def upsert_desktop_active_app(self, _supabase, user_id, platform_id, target, updated_at=None):
        self._record("upsert_active_app", {"platform": platform_id, "updated_at": updated_at})

    def update_app_work_session(self, _supabase, session_id, target, updated_at=None):
        self._record("update_session", {"id": session_id, "updated_at": updated_at})
        return {"id": session_id}

    def start_app_work_session(self, _supabase, user_id, target, started_at=None):
        self._next_id += 1
        session_id = f"session-{self._next_id}"
        self._record("start_session", {"id": session_id, "started_at": started_at})
        return {"id": session_id, "started_at": self.started_at_override or started_at}

    def get_open_work_session(self, _supabase, user_id):
        return self.open_session

    def close_stale_open_work_sessions(self, _supabase, stale_minutes=15):
        self._record("close_stale", stale_minutes)
