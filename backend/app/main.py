"""FastAPI application entrypoint for the office-hour scheduler backend.

This is scaffolding only — no domain features are implemented yet. It exposes
a single ``/health`` endpoint so the dev server can be verified end-to-end.
"""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user, require_active_user
from app.config import get_settings
from app.schemas import CurrentUser, Profile

settings = get_settings()

app = FastAPI(
    title="Office Hour Scheduler API",
    version="0.1.0",
)

# Allow the local Next.js dev server to call the API during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    """Liveness probe. Returns service status and the configured timezone."""
    return {"status": "ok", "timezone": settings.timezone}


@app.get("/me", response_model=Profile)
def read_me(user: CurrentUser = Depends(require_active_user)) -> Profile:
    """Return the authenticated user's profile.

    Requires a valid Supabase JWT AND an active, non-expired account (§3).
    Demonstrates the verification + access-guard dependencies end to end.
    """
    return user.profile


@app.get("/me/identity")
def read_identity(user: CurrentUser = Depends(get_current_user)) -> dict:
    """Lightweight identity echo — valid token only (no access-window check).

    Useful for confirming a token verifies and which role it carries.
    """
    return {"id": user.id, "email": user.email, "role": user.role}
