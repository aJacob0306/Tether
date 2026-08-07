"""The desktop window.

Renders the interface with the OS webview (WKWebView on macOS, WebView2 on Windows) so
the styling can match `tether-mobile/constants/theme.ts` exactly. The assets in `web/`
are the whole view; this module is the shell that owns state and forwards actions.

Like the Tkinter window, everything goes through `TetherService`. The webview never
touches Supabase or the platform adapter.
"""

from __future__ import annotations

import json
import logging
import sys
import threading
from pathlib import Path
from typing import Any

from ..auth import SessionUnavailableError
from ..config import ConfigError
from ..models import SyncResult
from ..platforms.base import UnsupportedPlatformError
from ..service import TetherService
from ..tracker import TrackerStatus

logger = logging.getLogger(__name__)

WINDOW_TITLE = "Tether Desktop"
WINDOW_SIZE = (460, 720)
MIN_SIZE = (400, 620)


def _web_root() -> Path:
    """Locate the front-end assets.

    PyInstaller unpacks bundled data next to `sys._MEIPASS`, not beside this module, so
    `__file__` only works when running from source.
    """
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
        return base / "tether_desktop" / "ui" / "web"
    return Path(__file__).parent / "web"


WEB_ROOT = _web_root()

BACKGROUND = "#0d0e0f"  # theme.colors.background, so no white flash before first paint


class UnavailableError(RuntimeError):
    """No usable system webview, so the caller should fall back to another shell."""


class _Bridge:
    """The object JavaScript sees as `window.pywebview.api`.

    Every method returns the full view state, which keeps the front end free of any
    state of its own: it renders whatever it is handed.
    """

    def __init__(self, window: TetherWindow) -> None:
        self._window = window

    def initial_state(self) -> dict[str, Any]:
        return self._window.load_initial_state()

    def sign_in(self, email: str, password: str) -> dict[str, Any]:
        return self._window.sign_in(email, password)

    def sync(self) -> dict[str, Any]:
        return self._window.sync()

    def sign_out(self) -> dict[str, Any]:
        return self._window.sign_out()


class TetherWindow:
    def __init__(self) -> None:
        self._service: TetherService | None = None
        self._startup_error: str | None = None
        self._window: Any = None
        self._lock = threading.Lock()
        self._icons: dict[str, str] | None = None

        self._state: dict[str, Any] = {
            "email": None,
            "device_name": None,
            "status": "Checking session…",
            "status_is_error": False,
            "synced_count": None,
            "tracking": "Sign in to start tracking allowlisted apps.",
            "tracking_tone": "offline",
            "tracking_target": None,
        }

        try:
            self._service = TetherService(on_status=self._on_tracker_status)
        except (UnsupportedPlatformError, ConfigError) as error:
            self._startup_error = str(error)

    # -- state ----------------------------------------------------------

    def _update(self, **changes: Any) -> dict[str, Any]:
        with self._lock:
            self._state.update(changes)
            return dict(self._state)

    def _push(self) -> None:
        """Send state to the webview from a non-UI thread (the tracker's poll thread)."""
        window = self._window
        if window is None:
            return

        with self._lock:
            payload = json.dumps(self._state)

        try:
            window.evaluate_js(f"window.tetherPush && window.tetherPush({payload})")
        except Exception as error:  # noqa: BLE001 - the window may be closing
            logger.debug("Could not push state to the window: %s", error)

    def _on_tracker_status(self, status: TrackerStatus) -> None:
        target = None
        if status.target_label:
            target = {"label": status.target_label, "icon": self._icon_for(status.target_label)}

        self._update(
            tracking=status.message, tracking_tone=status.tone, tracking_target=target
        )
        self._push()

    def _icon_for(self, label: str) -> str | None:
        """Best-effort icon for the tracked app.

        Scanning installed apps walks the filesystem, so the result is cached; the
        tracker asks for this on every poll and a rescan each time would be wasteful.
        """
        icons = self._icons
        if icons is None:
            icons = self._icons = self._load_icons()
        return icons.get(label)

    def _load_icons(self) -> dict[str, str]:
        if not self._service:
            return {}
        try:
            apps = self._service.adapter.detect_installed_apps()
        except Exception as error:  # noqa: BLE001 - an icon is never worth failing over
            logger.debug("Icon scan failed: %s", error)
            return {}

        icons = {}
        for app in apps:
            icon = (app.get("metadata") or {}).get("iconDataUrl")
            if icon and app.get("display_name"):
                icons[app["display_name"]] = icon
        return icons

    # -- actions --------------------------------------------------------

    def load_initial_state(self) -> dict[str, Any]:
        if self._startup_error:
            return self._update(status=self._startup_error, status_is_error=True)

        service = self._service
        assert service is not None

        try:
            service.bootstrap()
        except SessionUnavailableError as error:
            return self._update(status=str(error), status_is_error=True)
        except Exception as error:  # noqa: BLE001 - surfaced in the status line
            return self._update(status=_describe_error(error), status_is_error=True)

        status = service.get_status()
        session = status["session"]
        if not session:
            return self._update(
                email=None,
                status="Sign in to register this computer and upload installed apps.",
                status_is_error=False,
            )

        tracking = status["tracking"]
        return self._update(
            email=session.get("email"),
            device_name=(status["device"] or {}).get("display_name"),
            status="Ready to refresh detected apps.",
            status_is_error=False,
            tracking=tracking["last_status"],
            tracking_tone=tracking["tone"],
            tracking_target=(
                {"label": tracking["target_label"], "icon": self._icon_for(tracking["target_label"])}
                if tracking["target_label"]
                else None
            ),
        )

    def sign_in(self, email: str, password: str) -> dict[str, Any]:
        service = self._service
        if not service:
            return self._update(status=self._startup_error or "Unavailable", status_is_error=True)

        try:
            result = service.sign_in(email, password)
        except Exception as error:  # noqa: BLE001 - surfaced in the status line
            return self._update(status=_describe_error(error), status_is_error=True)

        sync: SyncResult = result["sync"]
        return self._update(
            email=(result["session"] or {}).get("email"),
            device_name=(result["device"] or {}).get("display_name"),
            status=describe_sync(sync),
            status_is_error=False,
            synced_count=sync.uploaded_count,
        )

    def sync(self) -> dict[str, Any]:
        service = self._service
        if not service:
            return self._update(status=self._startup_error or "Unavailable", status_is_error=True)

        try:
            sync = service.sync_detected_apps()
        except Exception as error:  # noqa: BLE001 - surfaced in the status line
            return self._update(status=_describe_error(error), status_is_error=True)

        self._icons = None  # the inventory just changed
        return self._update(
            status=describe_sync(sync), status_is_error=False, synced_count=sync.uploaded_count
        )

    def sign_out(self) -> dict[str, Any]:
        service = self._service
        if not service:
            return self._update(status=self._startup_error or "Unavailable", status_is_error=True)

        try:
            service.sign_out()
        except Exception as error:  # noqa: BLE001 - surfaced in the status line
            return self._update(status=_describe_error(error), status_is_error=True)

        return self._update(
            email=None,
            device_name=None,
            status="Signed out.",
            status_is_error=False,
            synced_count=None,
            tracking="Sign in to start tracking allowlisted apps.",
            tracking_tone="offline",
            tracking_target=None,
        )

    def _on_closing(self) -> None:
        if self._service:
            self._service.shutdown("Desktop companion is quitting")

    # -- lifecycle ------------------------------------------------------

    def run(self) -> int:
        webview = _import_webview()

        self._window = webview.create_window(
            WINDOW_TITLE,
            url=str(WEB_ROOT / "index.html"),
            js_api=_Bridge(self),
            width=WINDOW_SIZE[0],
            height=WINDOW_SIZE[1],
            min_size=MIN_SIZE,
            background_color=BACKGROUND,
        )
        self._window.events.closing += self._on_closing

        try:
            webview.start()
        except Exception as error:  # noqa: BLE001 - no renderer available
            raise UnavailableError(str(error)) from error
        return 0


def _import_webview():
    try:
        import webview
    except ImportError as error:
        raise UnavailableError("pywebview is not installed") from error
    return webview


def _describe_error(error: Exception) -> str:
    return str(error) or error.__class__.__name__


def describe_sync(sync: SyncResult) -> str:
    plural = "" if sync.uploaded_count == 1 else "s"
    return f"Synced {sync.uploaded_count} app{plural} ({sync.detected_count} detected)."


def main() -> int:
    return TetherWindow().run()


if __name__ == "__main__":
    raise SystemExit(main())
