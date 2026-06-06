"""Supabase client factories.

The service-role client bypasses RLS and has full database access, so it is used
ONLY server-side (PROJECT_SPEC §10) — never exposed to the browser. We use it to
load a user's profile after their JWT has already been verified.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_service_client() -> Client:
    """Cached Supabase client authenticated with the service-role key."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the backend .env"
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
