"""Work session and active-tab writes.

Ports the `work_sessions` and `active_tabs` helpers from the Electron `src/main.js`.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from postgrest.exceptions import APIError
from supabase import Client

from .config import STALE_SESSION_MINUTES
from .models import AllowedTarget
from .timeutil import now_iso

WORK_SESSION_COLUMNS = (
    "id,user_id,domain,url,title,started_at,ended_at,tether_id,target_type,"
    "target_value,target_display_name,bundle_identifier,platform"
)

# Python's quote() escapes a few characters that JavaScript's encodeURIComponent leaves
# alone; keeping them safe means both companions produce identical active_tabs URLs.
_URI_COMPONENT_SAFE = "!'()*"


def _target_label(target: AllowedTarget) -> str:
    return target.get("display_name") or target.get("value") or ""


def _target_tether_id(target: AllowedTarget) -> str | None:
    return target.get("resolved_tether_id") or target.get("tether_id") or None


def _target_metadata(target: AllowedTarget) -> dict[str, Any]:
    return {"source": "desktop_active_app", **(target.get("metadata") or {})}


def fetch_active_tether_id(supabase: Client) -> str | None:
    data = supabase.rpc("ensure_my_active_tether").execute().data
    return data if isinstance(data, str) else None


def fetch_allowed_app_targets(supabase: Client) -> list[AllowedTarget]:
    response = (
        supabase.table("tether_allowed_targets")
        .select("id,tether_id,value,display_name,bundle_identifier,platform,metadata")
        .eq("target_type", "app")
        .order("value", desc=False)
        .execute()
    )
    return response.data or []


def get_open_work_session(supabase: Client, user_id: str) -> dict[str, Any] | None:
    response = (
        supabase.table("work_sessions")
        .select(WORK_SESSION_COLUMNS)
        .eq("user_id", user_id)
        .is_("ended_at", "null")
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def close_work_session(supabase: Client, session_id: str, ended_at: str | None = None) -> None:
    supabase.table("work_sessions").update({"ended_at": ended_at or now_iso()}).eq(
        "id", session_id
    ).execute()


def close_stale_open_work_sessions(supabase: Client, stale_minutes: int = STALE_SESSION_MINUTES) -> None:
    supabase.rpc("close_stale_open_work_sessions", {"p_stale_minutes": stale_minutes}).execute()


def upsert_desktop_active_app(
    supabase: Client,
    user_id: str,
    platform_id: str,
    target: AllowedTarget,
    updated_at: str | None = None,
) -> None:
    label = _target_label(target)
    supabase.table("active_tabs").upsert(
        {
            "user_id": user_id,
            "url": f"app://{platform_id}/{quote(label, safe=_URI_COMPONENT_SAFE)}",
            "title": label,
            "updated_at": updated_at or now_iso(),
        },
        on_conflict="user_id",
    ).execute()


def clear_desktop_active_app(supabase: Client, user_id: str) -> None:
    supabase.table("active_tabs").delete().eq("user_id", user_id).execute()


def update_app_work_session(
    supabase: Client,
    session_id: str,
    target: AllowedTarget,
    updated_at: str | None = None,
) -> dict[str, Any]:
    label = _target_label(target)
    response = (
        supabase.table("work_sessions")
        .update(
            {
                "domain": label,
                "title": label,
                "updated_at": updated_at or now_iso(),
                "tether_id": _target_tether_id(target),
                "target_type": "app",
                "target_value": target.get("value"),
                "target_display_name": label,
                "bundle_identifier": target.get("bundle_identifier"),
                "platform": target.get("platform"),
                "metadata": _target_metadata(target),
            }
        )
        .eq("id", session_id)
        .execute()
    )
    return response.data[0]


def _is_duplicate_key(error: APIError) -> bool:
    return "duplicate key" in (error.message or "").lower() or error.code == "23505"


def start_app_work_session(
    supabase: Client,
    user_id: str,
    target: AllowedTarget,
    started_at: str | None = None,
) -> dict[str, Any]:
    """Open a work session, closing an orphaned one first if the database rejects it.

    A partial unique index allows only one open session per user, so a session left
    open by a previous run has to be closed before a new one can start.
    """
    timestamp = started_at or now_iso()
    label = _target_label(target)
    payload = {
        "user_id": user_id,
        "domain": label,
        "url": "",
        "title": label,
        "started_at": timestamp,
        "updated_at": timestamp,
        "tether_id": _target_tether_id(target),
        "target_type": "app",
        "target_value": target.get("value"),
        "target_display_name": label,
        "bundle_identifier": target.get("bundle_identifier"),
        "platform": target.get("platform"),
        "metadata": _target_metadata(target),
    }

    try:
        return supabase.table("work_sessions").insert(payload).execute().data[0]
    except APIError as error:
        if not _is_duplicate_key(error):
            raise

    existing = get_open_work_session(supabase, user_id)
    if existing and existing.get("id"):
        close_work_session(supabase, existing["id"])

    return supabase.table("work_sessions").insert(payload).execute().data[0]
