"""Supabase JWT verification and auth dependencies.

This project uses Supabase **asymmetric JWT signing keys** (confirmed: the
project's JWKS endpoint serves an ES256 / P-256 public key). Access tokens are
therefore verified against the public key published at the JWKS endpoint — not
the legacy HS256 shared secret. The legacy-secret path is kept as a documented
fallback so the code keeps working if a project is ever switched back.

Dependencies exposed:
  - get_current_user      -> verifies the JWT, loads the profile, returns identity+role
  - require_active_user   -> the above, plus a 403 if expired/deactivated (§3)
  - require_admin         -> the above, plus a 403 if not an admin
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError

from app.config import get_settings
from app.schemas import CurrentUser, Profile
from app.supabase_client import get_service_client

# Supabase access tokens carry aud="authenticated" and iss=<url>/auth/v1.
_AUDIENCE = "authenticated"

bearer_scheme = HTTPBearer(auto_error=True)

# Simple in-process JWKS cache: { kid: jwk_dict }. Refreshed on a cache miss so
# we automatically pick up rotated signing keys without a restart.
_jwks_cache: dict[str, dict] = {}


def _settings_urls() -> tuple[str, str]:
    base = get_settings().supabase_url.rstrip("/")
    return f"{base}/auth/v1/.well-known/jwks.json", f"{base}/auth/v1"


def _fetch_jwks() -> dict[str, dict]:
    jwks_url, _ = _settings_urls()
    resp = httpx.get(jwks_url, timeout=10.0)
    resp.raise_for_status()
    keys = resp.json().get("keys", [])
    return {k["kid"]: k for k in keys if "kid" in k}


def _get_signing_key(kid: str) -> Optional[dict]:
    """Return the JWK for `kid`, refreshing the cache once on a miss."""
    if kid in _jwks_cache:
        return _jwks_cache[kid]
    _jwks_cache.clear()
    _jwks_cache.update(_fetch_jwks())
    return _jwks_cache.get(kid)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _verify_token(token: str) -> dict[str, Any]:
    """Verify a Supabase access token and return its claims, or raise 401."""
    settings = get_settings()
    _, issuer = _settings_urls()

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise _unauthorized(f"Malformed token: {exc}")

    alg = header.get("alg")
    kid = header.get("kid")

    try:
        if alg and alg.startswith("HS"):
            # Legacy shared-secret projects (fallback). Not used here.
            if not settings.supabase_jwt_secret:
                raise _unauthorized("Server not configured for HS256 tokens")
            key: Any = settings.supabase_jwt_secret
            algorithms = [alg]
        else:
            # Asymmetric (this project): verify against the JWKS public key.
            if not kid:
                raise _unauthorized("Token missing key id (kid)")
            jwk = _get_signing_key(kid)
            if jwk is None:
                raise _unauthorized("Unknown signing key")
            key = jwk
            algorithms = [jwk.get("alg", alg or "ES256")]

        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=_AUDIENCE,
            issuer=issuer,
            options={"verify_aud": True, "verify_iss": True, "verify_exp": True},
        )
    except HTTPException:
        raise
    except JWTError as exc:
        raise _unauthorized(f"Invalid token: {exc}")

    return claims


def _load_profile(user_id: str) -> Profile:
    client = get_service_client()
    resp = (
        client.table("profiles")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        # Authenticated in Supabase Auth but no profile row — treat as forbidden.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No profile found for this account",
        )
    return Profile(**rows[0])


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    """Verify the bearer JWT, load the profile, and expose identity + role.

    Identity (id/email) comes from the verified token; role/profile from the DB.
    """
    claims = _verify_token(credentials.credentials)
    user_id = claims.get("sub")
    if not user_id:
        raise _unauthorized("Token missing subject (sub)")

    profile = _load_profile(user_id)
    return CurrentUser(
        id=user_id,
        email=claims.get("email") or profile.email,
        role=profile.role,
        profile=profile,
    )


def require_active_user(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Reject deactivated accounts and students past their access window (§3)."""
    if not user.profile.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact an administrator.",
        )

    expires_at = user.profile.access_expires_at
    if expires_at is not None:
        # Stored as timestamptz (UTC). Compare against an aware UTC now.
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your access has expired. Please contact an administrator.",
            )

    return user


def require_admin(
    user: CurrentUser = Depends(require_active_user),
) -> CurrentUser:
    """Require an active admin (PROJECT_SPEC §8)."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
