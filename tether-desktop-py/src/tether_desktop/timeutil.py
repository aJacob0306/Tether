"""Timestamp helpers.

Timestamps are formatted the way JavaScript's `Date.toISOString()` formats them
(milliseconds precision, `Z` suffix) so rows written by the Python and Electron
companions are indistinguishable.
"""

from __future__ import annotations

from datetime import datetime, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def now_iso() -> str:
    return to_iso(now())


def parse_iso(value: str | None) -> datetime | None:
    """Parse a timestamp from Postgres or from a JavaScript-written state file."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
