"""Supabase client construction."""

from __future__ import annotations

from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from .config import Config


def create_supabase_client(config: Config) -> Client:
    return create_client(
        config.supabase_url,
        config.supabase_anon_key,
        SyncClientOptions(auto_refresh_token=True, persist_session=False),
    )
