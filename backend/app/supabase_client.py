"""Supabase client factories.

The service-role client bypasses RLS and has full database access, so it is used
ONLY server-side (PROJECT_SPEC §10) — never exposed to the browser. We use it to
load a user's profile after their JWT has already been verified.
"""

from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from app.config import get_settings


class RawSupabaseClient:
    """Small PostgREST client for newer sb_secret keys.

    supabase-py 2.11 can reject newer secret keys locally. This covers the
    table/query operations the backend uses while keeping the key server-only.
    """

    def __init__(self, supabase_url: str, api_key: str) -> None:
        self.supabase_url = supabase_url.rstrip("/")
        self.api_key = api_key

    def table(self, name: str) -> "RawSupabaseQuery":
        return RawSupabaseQuery(self.supabase_url, self.api_key, name)


class RawSupabaseResponse:
    def __init__(self, data: Any, count: int | None = None) -> None:
        self.data = data
        self.count = count


class RawSupabaseQuery:
    def __init__(self, supabase_url: str, api_key: str, table_name: str) -> None:
        self.supabase_url = supabase_url
        self.api_key = api_key
        self.table_name = table_name
        self.method = "GET"
        self.params: dict[str, str] = {}
        self.headers: dict[str, str] = {}
        self.payload: Any = None
        self.want_count = False

    def select(self, columns: str = "*", count: str | None = None) -> "RawSupabaseQuery":
        self.params["select"] = columns
        if count == "exact":
            self.want_count = True
            self.headers["Prefer"] = append_prefer(self.headers.get("Prefer"), "count=exact")
        return self

    def eq(self, column: str, value: Any) -> "RawSupabaseQuery":
        self.params[column] = f"eq.{format_value(value)}"
        return self

    def gte(self, column: str, value: Any) -> "RawSupabaseQuery":
        self.params[column] = f"gte.{format_value(value)}"
        return self

    def lte(self, column: str, value: Any) -> "RawSupabaseQuery":
        self.params[column] = f"lte.{format_value(value)}"
        return self

    def lt(self, column: str, value: Any) -> "RawSupabaseQuery":
        self.params[column] = f"lt.{format_value(value)}"
        return self

    def limit(self, count: int) -> "RawSupabaseQuery":
        self.params["limit"] = str(count)
        return self

    def order(self, column: str, desc: bool = False) -> "RawSupabaseQuery":
        existing = self.params.get("order")
        item = f"{column}.{'desc' if desc else 'asc'}"
        self.params["order"] = f"{existing},{item}" if existing else item
        return self

    def insert(self, payload: dict[str, Any]) -> "RawSupabaseQuery":
        self.method = "POST"
        self.payload = payload
        self.headers["Prefer"] = append_prefer(self.headers.get("Prefer"), "return=representation")
        return self

    def update(self, payload: dict[str, Any]) -> "RawSupabaseQuery":
        self.method = "PATCH"
        self.payload = payload
        self.headers["Prefer"] = append_prefer(self.headers.get("Prefer"), "return=representation")
        return self

    def delete(self) -> "RawSupabaseQuery":
        self.method = "DELETE"
        self.headers["Prefer"] = append_prefer(self.headers.get("Prefer"), "return=minimal")
        return self

    def upsert(self, rows: list[dict[str, Any]], on_conflict: str) -> "RawSupabaseQuery":
        self.method = "POST"
        self.payload = rows
        self.params["on_conflict"] = on_conflict
        self.headers["Prefer"] = append_prefer(
            self.headers.get("Prefer"),
            "resolution=merge-duplicates,return=minimal",
        )
        return self

    def execute(self) -> RawSupabaseResponse:
        import httpx

        response = httpx.request(
            self.method,
            f"{self.supabase_url}/rest/v1/{self.table_name}",
            params=self.params,
            headers={
                "apikey": self.api_key,
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                **self.headers,
            },
            json=self.payload,
            timeout=30.0,
        )
        if response.is_error:
            raise RuntimeError(f"Supabase request failed: {response.status_code} {response.text}")

        data: Any
        if response.content:
            data = response.json()
        else:
            data = []

        count = None
        content_range = response.headers.get("content-range")
        if self.want_count and content_range and "/" in content_range:
            count = int(content_range.rsplit("/", 1)[-1] or 0)

        return RawSupabaseResponse(data=data, count=count)


def format_value(value: Any) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def append_prefer(existing: str | None, value: str) -> str:
    if not existing:
        return value
    parts = [part.strip() for part in existing.split(",")]
    return existing if value in parts else f"{existing},{value}"


@lru_cache
def get_service_client() -> Client:
    """Cached Supabase client authenticated with the service-role key."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the backend .env"
        )
    if settings.supabase_service_role_key.startswith("sb_secret_"):
        return RawSupabaseClient(settings.supabase_url, settings.supabase_service_role_key)  # type: ignore[return-value]
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
