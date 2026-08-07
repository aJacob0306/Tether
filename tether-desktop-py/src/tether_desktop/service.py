"""Application service.

Ports the orchestration that lived in Electron's IPC handlers and `app.whenReady`.
The CLI and the Tkinter window both drive the app through this class, so neither shell
contains any Supabase or platform logic of its own.
"""

from __future__ import annotations

import atexit
import logging
import signal
import threading
from typing import Any

from . import paths, sessions
from .auth import AuthStore, SessionUnavailableError
from .config import TRACKING_STATE_FILE, Config, load_config
from .detected_tools import upload_detected_apps
from .devices import DeviceRegistry
from .models import SyncResult
from .platforms import get_platform_adapter
from .supabase_client import create_supabase_client
from .timeutil import now_iso
from .tracker import StatusCallback, Tracker

logger = logging.getLogger(__name__)

APP_VERSION = "0.1.0"


class TetherService:
    def __init__(self, config: Config | None = None, on_status: StatusCallback | None = None) -> None:
        self.config = config or load_config()
        self.adapter = get_platform_adapter()
        self.supabase = create_supabase_client(self.config)
        self.auth = AuthStore(self.supabase, self.config)
        self.devices = DeviceRegistry(self.supabase, self.auth, self.adapter, APP_VERSION)
        self.tracker = Tracker(
            self.supabase, self.auth, self.devices, self.adapter, self.config, on_status
        )
        self._shutdown_lock = threading.Lock()
        self._has_shut_down = False

    # -- lifecycle ------------------------------------------------------

    def bootstrap(self) -> bool:
        """Restore a saved session and resume tracking. Returns True if signed in."""
        if not self.auth.load_saved_session():
            return False

        try:
            sessions.close_stale_open_work_sessions(self.supabase)
        except Exception as error:
            logger.info("Stale session cleanup failed: %s", error)

        try:
            self.devices.register()
        except Exception as error:
            logger.info("Device registration failed: %s", error)
            return True

        self.tracker.start()
        return True

    def shutdown(self, reason: str = "Desktop companion is quitting") -> None:
        with self._shutdown_lock:
            if self._has_shut_down:
                return
            self._has_shut_down = True

        self.tracker.stop(close_session=False)
        try:
            self.tracker.flush_close(reason)
        except Exception as error:
            logger.info("Quit close failed: %s", error)

    def install_shutdown_handlers(self) -> None:
        """Close the open work session on Ctrl-C, SIGTERM, or interpreter exit.

        This stands in for Electron's `powerMonitor` quit handling. Signal handlers can
        only be registered from the main thread, so a GUI worker thread falls back to
        the atexit hook alone.
        """
        atexit.register(self.shutdown)

        def handle(signum, _frame):
            self.shutdown(f"received {signal.Signals(signum).name}")
            raise SystemExit(0)

        for signum in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(signum, handle)
            except ValueError:
                logger.debug("Could not install handler for %s off the main thread", signum)

    # -- actions --------------------------------------------------------

    def sign_in(self, email: str, password: str) -> dict[str, Any]:
        self.config.assert_configured()
        self.auth.sign_in(email, password)
        sync = self.sync_detected_apps()
        self.tracker.start()
        return {
            "session": self.auth.public_session(),
            "device": self.devices.device,
            "sync": sync,
        }

    def sign_out(self) -> None:
        try:
            self.tracker.stop()
        except Exception as error:
            logger.info("Stop tracking during sign out failed: %s", error)
        self.devices.clear()
        self.auth.sign_out()

    def sync_detected_apps(self) -> SyncResult:
        self.config.assert_configured()
        device = self.devices.register()
        apps = self.adapter.detect_installed_apps()
        uploaded = upload_detected_apps(
            self.supabase, self.auth.user_id(), device["id"], apps
        )
        return SyncResult(detected_count=len(apps), uploaded_count=uploaded, synced_at=now_iso())

    def get_status(self) -> dict[str, Any]:
        offline_reason = None
        if not self.auth.session:
            try:
                self.auth.load_saved_session()
            except SessionUnavailableError as error:
                offline_reason = str(error)

        tracking_state = paths.read_json(TRACKING_STATE_FILE) or {}
        return {
            "session": self.auth.public_session(),
            "device": self.devices.device,
            "offline_reason": offline_reason,
            "tracking": {
                "active": self.tracker.is_running,
                "target_label": tracking_state.get("targetLabel"),
                "last_status": self.tracker.last_status.message,
                "tone": self.tracker.last_status.tone,
            },
        }
