"""Work-start push notifications.

Ports `notifyPeersStartedApp` from the Electron `src/main.js`. The edge function is
called directly over HTTP rather than through the Supabase functions client so the
user's access token is sent exactly as the Deno function expects it.
"""

from __future__ import annotations

import time

import httpx

from . import paths
from .config import NOTIFY_COOLDOWN_SECONDS, TRACKING_STATE_FILE, Config
from .models import AllowedTarget

NOTIFY_TIMEOUT_SECONDS = 10.0


def notify_peers_started_app(config: Config, access_token: str, target: AllowedTarget) -> bool:
    """Tell tether peers that work started. Returns False when the cooldown blocks it.

    The cooldown timestamp lives in the shared tracking-state file and is stored in
    milliseconds to stay compatible with the Electron companion.
    """
    tracking_state = paths.read_json(TRACKING_STATE_FILE) or {}
    last_notify_at = tracking_state.get("lastNotifyAt") or 0
    now_ms = time.time() * 1000

    if now_ms - last_notify_at < NOTIFY_COOLDOWN_SECONDS * 1000:
        return False

    label = target.get("display_name") or target.get("value")
    response = httpx.post(
        f"{config.supabase_url}/functions/v1/send-work-started-push",
        headers={
            "apikey": config.supabase_anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={
            "target_type": "app",
            "target_label": label,
            "bundle_identifier": target.get("bundle_identifier"),
        },
        timeout=NOTIFY_TIMEOUT_SECONDS,
    )

    if response.is_error:
        try:
            message = response.json().get("error")
        except ValueError:
            message = None
        raise RuntimeError(message or f"Notify failed ({response.status_code})")

    # Re-read so a concurrent tracker write is not clobbered by a stale copy.
    latest_state = paths.read_json(TRACKING_STATE_FILE) or {}
    paths.write_json(TRACKING_STATE_FILE, {**latest_state, "lastNotifyAt": int(now_ms)})
    return True
