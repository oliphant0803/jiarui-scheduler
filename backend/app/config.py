"""Application configuration loaded from environment variables.

Values are read from the process environment, falling back to a local
``.env`` file during development (see ``.env.example`` for the full list).
Secrets must never be committed — only ``.env.example`` is tracked.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase project URL, e.g. https://xxxx.supabase.co
    supabase_url: str = ""
    # Public anon key — safe to expose to clients.
    supabase_anon_key: str = ""
    # Service-role key — full DB access, server-side ONLY. Never expose.
    supabase_service_role_key: str = ""
    # JWT secret used to verify Supabase-issued access tokens.
    supabase_jwt_secret: str = ""

    # Default timezone for scheduling (IANA name, e.g. America/Toronto).
    timezone: str = "UTC"

    # Admin bootstrap credentials, read by scripts/seed_admin.py only.
    # NEVER hardcoded or committed (PROJECT_SPEC §2).
    admin_email: str = ""
    admin_password: str = ""


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
