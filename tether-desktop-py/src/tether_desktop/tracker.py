"""The foreground-app tracking loop.

Ports `syncActiveAppOnce` and the surrounding loop from the Electron `src/main.js`.

One behavioural difference from Electron: `powerMonitor` supplied free `suspend`,
`lock-screen`, and `shutdown` events, which Python has no cross-platform equivalent
for. Sleep and lock are instead absorbed by the idle check below, and `close_on_exit`
handles quitting. The visible effect is that a session can stay open a little longer
after a lid close than it did before, until the idle threshold catches it.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable, Literal

from supabase import Client

from . import paths, sessions
from .auth import AuthStore
from .config import (
    TRACKING_IDLE_CLOSE_SECONDS,
    TRACKING_IDLE_GRACE_SECONDS,
    TRACKING_POLL_SECONDS,
    TRACKING_STATE_FILE,
    Config,
)
from .devices import DeviceRegistry
from .matching import app_match_key, resolve_allowed_app
from .notify import notify_peers_started_app
from .platforms.base import PlatformAdapter
from .timeutil import now, now_iso, parse_iso, to_iso

logger = logging.getLogger(__name__)

Tone = Literal["working", "idle", "offline"]


@dataclass(frozen=True)
class TrackerStatus:
    """What the tracker is doing, for anything that wants to show it.

    The tone exists so a UI can pick a colour without pattern-matching the message.
    """

    message: str
    tone: Tone = "offline"
    target_label: str | None = None

    def __str__(self) -> str:
        return self.message


StatusCallback = Callable[[TrackerStatus], None]

# Fields describing the currently open session. Cleared together when it closes;
# `lastNotifyAt` deliberately survives so the push cooldown is not reset.
_SESSION_STATE_FIELDS = ("openSessionId", "targetKey", "targetLabel", "lastActiveAt", "sessionStartedAt")


class Tracker:
    def __init__(
        self,
        supabase: Client,
        auth: AuthStore,
        devices: DeviceRegistry,
        adapter: PlatformAdapter,
        config: Config,
        on_status: StatusCallback | None = None,
    ) -> None:
        self._supabase = supabase
        self._auth = auth
        self._devices = devices
        self._adapter = adapter
        self._config = config
        self._on_status = on_status
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._last_status = TrackerStatus("Active app tracking is not running.")

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def last_status(self) -> TrackerStatus:
        return self._last_status

    def _status(self, message: str, tone: Tone, target_label: str | None = None) -> None:
        status = TrackerStatus(message, tone, target_label)
        self._last_status = status
        logger.info("%s", message)
        if self._on_status:
            self._on_status(status)

    # -- tracking state -------------------------------------------------

    @staticmethod
    def _read_state() -> dict[str, Any]:
        return paths.read_json(TRACKING_STATE_FILE) or {}

    @staticmethod
    def _write_state(state: dict[str, Any]) -> None:
        paths.write_json(TRACKING_STATE_FILE, state)

    # -- idle maths -----------------------------------------------------

    def _idle_seconds(self) -> float:
        return self._adapter.system_idle_seconds()

    def _is_system_idle(self) -> bool:
        return self._idle_seconds() >= TRACKING_IDLE_CLOSE_SECONDS

    def _idle_ended_at(self) -> datetime:
        """When the session should be considered finished, given current idle time.

        Credit stops a grace period after the user went quiet, never after now.
        """
        current = now()
        idle_started_at = current - timedelta(seconds=self._idle_seconds())
        return min(current, idle_started_at + timedelta(seconds=TRACKING_IDLE_GRACE_SECONDS))

    def _idle_session_ended_at(self, state: dict[str, Any]) -> str:
        ended_at = self._idle_ended_at()
        started_at = parse_iso(state.get("sessionStartedAt"))
        if started_at:
            ended_at = max(started_at, ended_at)
        return to_iso(ended_at)

    # -- session transitions --------------------------------------------

    def _close_tracked_session_if_needed(
        self, state: dict[str, Any], ended_at: str | None = None
    ) -> None:
        if not state.get("openSessionId"):
            return

        try:
            sessions.close_work_session(self._supabase, state["openSessionId"], ended_at)
        finally:
            self._write_state({**state, **dict.fromkeys(_SESSION_STATE_FIELDS, None)})

    def _clear_active_app(self) -> None:
        sessions.clear_desktop_active_app(self._supabase, self._auth.user_id())

    def sync_once(self) -> None:
        """One tick: reconcile the foreground app with the open work session."""
        self._auth.ensure_session()

        try:
            self._devices.touch_heartbeat_if_needed()
        except Exception as error:
            logger.info("Device heartbeat skipped: %s", error)

        state = self._read_state()

        if self._is_system_idle():
            self._close_tracked_session_if_needed(state, self._idle_session_ended_at(state))
            self._clear_active_app()
            self._status(f"Tracking paused: {self._adapter.platform_label} is idle.", "idle")
            return

        active_app = self._adapter.get_frontmost_app()
        targets = sessions.fetch_allowed_app_targets(self._supabase)
        try:
            active_tether_id = sessions.fetch_active_tether_id(self._supabase)
        except Exception:
            active_tether_id = None

        allowed_app = resolve_allowed_app(active_app, targets, active_tether_id)
        timestamp = now_iso()

        if not allowed_app:
            self._close_tracked_session_if_needed(state)
            self._clear_active_app()
            self._status(
                f"No allowlisted app active ({active_app.display_name})."
                if active_tether_id
                else "Pick an active tether in the mobile app to track overlapping apps "
                f"({active_app.display_name}).",
                "idle",
            )
            return

        user_id = self._auth.user_id()
        target_key = f"{app_match_key(allowed_app)}:{allowed_app['resolved_tether_id']}"
        target_label = allowed_app.get("display_name") or allowed_app.get("value")

        if state.get("openSessionId") and state.get("targetKey") == target_key:
            sessions.update_app_work_session(
                self._supabase, state["openSessionId"], allowed_app, timestamp
            )
            sessions.upsert_desktop_active_app(
                self._supabase, user_id, self._adapter.platform_id, allowed_app, timestamp
            )
            self._write_state(
                {**state, "lastActiveAt": timestamp, "tetherId": allowed_app["resolved_tether_id"]}
            )
            self._status(f"Tracking {target_label}.", "working", target_label)
            return

        self._close_tracked_session_if_needed(state)
        work_session = sessions.start_app_work_session(
            self._supabase, user_id, allowed_app, timestamp
        )
        sessions.upsert_desktop_active_app(
            self._supabase, user_id, self._adapter.platform_id, allowed_app, timestamp
        )
        self._write_state(
            {
                **state,
                "openSessionId": work_session["id"],
                "targetKey": target_key,
                "targetLabel": target_label,
                "tetherId": allowed_app["resolved_tether_id"],
                "lastActiveAt": timestamp,
                "sessionStartedAt": work_session.get("started_at") or timestamp,
            }
        )

        try:
            notify_peers_started_app(self._config, self._auth.access_token(), allowed_app)
        except Exception as error:
            logger.info("Work-start notify failed: %s", error)

        self._status(f"Tracking {target_label}.", "working", target_label)

    def flush_close(self, reason: str) -> None:
        """Close any open session because tracking is being interrupted."""
        state = self._read_state()
        if not state.get("openSessionId"):
            self._status(f"Tracking paused: {reason}.", "offline")
            return

        self._close_tracked_session_if_needed(state, self._idle_session_ended_at(state))
        self._clear_active_app()
        self._status(f"Tracking paused: {reason}.", "offline")

    # -- loop -----------------------------------------------------------

    def _run(self) -> None:
        while not self._stop_event.is_set():
            started = now()
            try:
                self.sync_once()
            except Exception as error:
                logger.info("Active app tracking skipped: %s", error)
                self._status(f"Tracking paused: {error}", "offline")

            elapsed = (now() - started).total_seconds()
            self._stop_event.wait(max(0.0, TRACKING_POLL_SECONDS - elapsed))

    def start(self) -> None:
        with self._lock:
            if self.is_running:
                return
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, name="tether-tracker", daemon=True)
            self._status("Active app tracking started.", "idle")
            self._thread.start()

    def stop(self, close_session: bool = True) -> None:
        with self._lock:
            thread = self._thread
            self._stop_event.set()
            self._thread = None

        if thread and thread.is_alive():
            thread.join(timeout=TRACKING_POLL_SECONDS * 2)

        if close_session:
            state = self._read_state()
            try:
                self._close_tracked_session_if_needed(state)
                self._clear_active_app()
            except Exception as error:
                logger.info("Stop close failed: %s", error)

        self._status("Active app tracking stopped.", "offline")
