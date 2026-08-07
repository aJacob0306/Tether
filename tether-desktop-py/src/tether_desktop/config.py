"""Environment configuration and tracking constants.

Ported from the timing constants at the top of the Electron `src/main.js`.
Durations are seconds here rather than the milliseconds the JavaScript used.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .paths import data_dir

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DEVICE_TYPE = "desktop"
UPSERT_CHUNK_SIZE = 100
TRACKING_POLL_SECONDS = 5.0
TRACKING_IDLE_CLOSE_SECONDS = 2 * 60.0
TRACKING_IDLE_GRACE_SECONDS = 30.0
NOTIFY_COOLDOWN_SECONDS = 30 * 60.0
DEVICE_HEARTBEAT_SECONDS = 60.0
STALE_SESSION_MINUTES = 15

DEVICE_FILE = "device.json"
SESSION_FILE = "session.json"
TRACKING_STATE_FILE = "tracking-state.json"

FALLBACK_SUPABASE_URL = "https://example.supabase.co"
FALLBACK_SUPABASE_ANON_KEY = "sb_publishable_missing"


class ConfigError(RuntimeError):
    """Raised when Supabase credentials are missing."""


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_anon_key: str
    is_configured: bool

    def assert_configured(self) -> None:
        if not self.is_configured:
            raise ConfigError("Add SUPABASE_URL and SUPABASE_ANON_KEY to tether-desktop-py/.env.")


def candidate_env_files() -> list[Path]:
    """Where to look for a `.env`, most specific first.

    A packaged app has no source tree next to it, so the user data directory is checked
    as well; that is the only writable location a bundled `.app` or `.exe` can rely on.
    """
    override = os.environ.get("TETHER_ENV_FILE")
    if override:
        return [Path(override)]

    candidates = [data_dir() / ".env"]
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / ".env")
    else:
        candidates.append(PROJECT_ROOT / ".env")

    return candidates


def load_config() -> Config:
    for env_file in candidate_env_files():
        if env_file.is_file():
            load_dotenv(env_file, override=False)
            break

    raw_url = (os.environ.get("SUPABASE_URL") or "").strip()
    raw_key = (os.environ.get("SUPABASE_ANON_KEY") or "").strip()

    return Config(
        supabase_url=raw_url.rstrip("/") if raw_url else FALLBACK_SUPABASE_URL,
        supabase_anon_key=raw_key or FALLBACK_SUPABASE_ANON_KEY,
        is_configured=bool(raw_url and raw_key),
    )
