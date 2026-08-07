"""Uploading discovered desktop apps.

Ports `uploadDetectedApps` from the Electron `src/main.js`: everything previously
reported by this device is marked unavailable first, then the current scan is upserted
in chunks so a large app inventory does not exceed request limits.
"""

from __future__ import annotations

from collections.abc import Sequence

from supabase import Client

from .config import UPSERT_CHUNK_SIZE
from .models import DetectedApp
from .timeutil import now_iso


def upload_detected_apps(
    supabase: Client,
    user_id: str,
    device_id: str,
    detected_apps: Sequence[DetectedApp],
) -> int:
    timestamp = now_iso()

    supabase.table("detected_tools").update(
        {"is_available": False, "last_seen_at": timestamp}
    ).eq("device_id", device_id).eq("tool_type", "app").execute()

    rows = [
        {
            **app,
            "user_id": user_id,
            "device_id": device_id,
            "is_available": True,
            "detected_at": timestamp,
            "last_seen_at": timestamp,
        }
        for app in detected_apps
    ]

    for start in range(0, len(rows), UPSERT_CHUNK_SIZE):
        chunk = rows[start : start + UPSERT_CHUNK_SIZE]
        supabase.table("detected_tools").upsert(
            chunk, on_conflict="user_id,device_id,tool_type,tool_key"
        ).execute()

    return len(rows)
