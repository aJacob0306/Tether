"""Per-operating-system adapters."""

from __future__ import annotations

import sys

from .base import PlatformAdapter, UnsupportedPlatformError

__all__ = ["PlatformAdapter", "UnsupportedPlatformError", "get_platform_adapter"]


def get_platform_adapter() -> PlatformAdapter:
    if sys.platform == "darwin":
        from .darwin import DarwinAdapter

        return DarwinAdapter()

    if sys.platform == "win32":
        from .win32 import WindowsAdapter

        return WindowsAdapter()

    raise UnsupportedPlatformError(
        f"Desktop companion is not supported on {sys.platform} yet. Use macOS or Windows."
    )
