"""Device registration and heartbeat.

Ports `getInstallationId`, `registerDevice`, and `touchCurrentDeviceHeartbeatIfNeeded`
from the Electron `src/main.js`.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from supabase import Client

from . import paths
from .auth import AuthStore
from .config import DEVICE_FILE, DEVICE_HEARTBEAT_SECONDS, DEVICE_TYPE
from .platforms.base import PlatformAdapter
from .timeutil import now_iso


def get_installation_id() -> str:
    existing = paths.read_json(DEVICE_FILE)
    if existing and existing.get("installationId"):
        return str(existing["installationId"])

    installation_id = str(uuid.uuid4())
    paths.write_json(DEVICE_FILE, {"installationId": installation_id})
    return installation_id


class DeviceRegistry:
    def __init__(self, supabase: Client, auth: AuthStore, adapter: PlatformAdapter, app_version: str) -> None:
        self._supabase = supabase
        self._auth = auth
        self._adapter = adapter
        self._app_version = app_version
        self._device: dict[str, Any] | None = None
        self._last_heartbeat_at = 0.0

    @property
    def device(self) -> dict[str, Any] | None:
        return self._device

    def clear(self) -> None:
        self._device = None
        self._last_heartbeat_at = 0.0

    def register(self) -> dict[str, Any]:
        session = self._auth.ensure_session()
        response = (
            self._supabase.table("devices")
            .upsert(
                {
                    "user_id": session["user"]["id"],
                    "installation_id": get_installation_id(),
                    "platform": self._adapter.platform_id,
                    "device_type": DEVICE_TYPE,
                    "display_name": self._adapter.device_display_name(),
                    "app_version": self._app_version,
                    "last_seen_at": now_iso(),
                },
                on_conflict="user_id,installation_id",
            )
            .execute()
        )

        self._device = response.data[0]
        return self._device

    def ensure_registered(self) -> dict[str, Any]:
        return self._device or self.register()

    def touch_heartbeat_if_needed(self) -> None:
        if not (self._device or {}).get("id"):
            return

        now = time.monotonic()
        if now - self._last_heartbeat_at < DEVICE_HEARTBEAT_SECONDS:
            return

        self._last_heartbeat_at = now
        session = self._auth.ensure_session()
        try:
            response = (
                self._supabase.table("devices")
                .update({"last_seen_at": now_iso()})
                .eq("id", self._device["id"])
                .eq("user_id", session["user"]["id"])
                .is_("revoked_at", "null")
                .execute()
            )
        except Exception:
            # Let the next tick retry rather than waiting out the full interval.
            self._last_heartbeat_at = 0.0
            raise

        if response.data:
            self._device = {**self._device, "last_seen_at": response.data[0]["last_seen_at"]}
