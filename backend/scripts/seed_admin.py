"""Seed the single admin account (PROJECT_SPEC §2).

Reads ADMIN_EMAIL / ADMIN_PASSWORD and the Supabase service-role key from the
backend `.env` (never hardcoded, never committed). It:

  1. Creates the Supabase Auth user (idempotent — reuses an existing user).
  2. Promotes that user's profile to role='admin', is_active=true, and clears
     access_expires_at so the admin never expires.

The service-role key bypasses RLS, so this must run server-side only.

Usage (from the backend/ directory, with the venv active and `.env` filled):

    python scripts/seed_admin.py

Re-running is safe: it will not create a duplicate and simply re-asserts the
admin role/flags on the existing profile.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python scripts/seed_admin.py` from the backend/ directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from supabase import Client, create_client  # noqa: E402

from app.config import get_settings  # noqa: E402


def _find_existing_user_id(client: Client, email: str) -> str | None:
    """Return the auth user id for ``email`` if it already exists, else None."""
    # list_users paginates; scan pages until we find the email or run out.
    page = 1
    while True:
        users = client.auth.admin.list_users(page=page, per_page=200)
        if not users:
            return None
        for user in users:
            if (user.email or "").lower() == email.lower():
                return user.id
        if len(users) < 200:
            return None
        page += 1


def seed_admin() -> None:
    settings = get_settings()

    missing = [
        name
        for name, value in {
            "SUPABASE_URL": settings.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": settings.supabase_service_role_key,
            "ADMIN_EMAIL": settings.admin_email,
            "ADMIN_PASSWORD": settings.admin_password,
        }.items()
        if not value
    ]
    if missing:
        raise SystemExit(
            "Missing required env var(s): "
            + ", ".join(missing)
            + ".\nFill them in backend/.env (see .env.example) and retry."
        )

    # Service-role client — full access, bypasses RLS. Server-side only.
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    user_id: str | None = None
    try:
        created = client.auth.admin.create_user(
            {
                "email": settings.admin_email,
                "password": settings.admin_password,
                "email_confirm": True,  # admin doesn't need to click a verify link
            }
        )
        user_id = created.user.id if created and created.user else None
        print(f"Created auth user for {settings.admin_email}")
    except Exception as exc:  # user likely already exists — look them up
        print(f"create_user did not create a new user ({exc}); looking up existing…")
        user_id = _find_existing_user_id(client, settings.admin_email)

    if not user_id:
        raise SystemExit(
            f"Could not create or find an auth user for {settings.admin_email}."
        )

    # Promote the profile. The handle_new_user trigger creates the profile row as
    # a 'student'; here we (the service role) override the privileged fields.
    result = (
        client.table("profiles")
        .update(
            {
                "role": "admin",
                "is_active": True,
                "access_expires_at": None,
            }
        )
        .eq("id", user_id)
        .execute()
    )

    if not result.data:
        # No profile row yet (e.g. trigger not installed) — upsert one.
        client.table("profiles").upsert(
            {
                "id": user_id,
                "email": settings.admin_email,
                "role": "admin",
                "is_active": True,
                "access_expires_at": None,
            }
        ).execute()

    print(f"✓ Admin ready: {settings.admin_email} (id={user_id})")


if __name__ == "__main__":
    seed_admin()
