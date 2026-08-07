"""The contract every OS adapter implements.

Keeping this narrow is what lets the tracker, CLI, and UI stay platform agnostic, and
what makes it possible to write the Windows adapter without a Windows machine to hand.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..models import ActiveApp, DetectedApp


class UnsupportedPlatformError(RuntimeError):
    """Raised on an operating system that has no adapter."""


@runtime_checkable
class PlatformAdapter(Protocol):
    platform_id: str
    platform_label: str

    def detect_installed_apps(self) -> list[DetectedApp]:
        """Scan the machine for installed applications."""

    def get_frontmost_app(self) -> ActiveApp:
        """Return the application the user is currently focused on."""

    def system_idle_seconds(self) -> float:
        """Seconds since the last keyboard or mouse input."""

    def device_display_name(self) -> str:
        """A human-friendly name for this computer."""
