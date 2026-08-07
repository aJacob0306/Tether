"""Shared value types."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

AllowedTarget = dict[str, Any]
DetectedApp = dict[str, Any]


@dataclass(frozen=True)
class ActiveApp:
    """The foreground application reported by a platform adapter."""

    display_name: str
    bundle_identifier: str | None = None
    executable_name: str | None = None
    executable_path: str | None = None


@dataclass(frozen=True)
class SyncResult:
    detected_count: int
    uploaded_count: int
    synced_at: str
