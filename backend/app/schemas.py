"""Pydantic models shared across the API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

UserRole = Literal["student", "admin"]


class Profile(BaseModel):
    """A row from public.profiles (PROJECT_SPEC §3, §9)."""

    id: str
    role: UserRole
    full_name: Optional[str] = None
    phone: Optional[str] = None
    wechat: Optional[str] = None
    email: Optional[str] = None
    access_expires_at: Optional[datetime] = None
    is_active: bool = True
    created_at: Optional[datetime] = None


class CurrentUser(BaseModel):
    """The authenticated identity exposed to handlers: verified claims + profile.

    `id`/`email` come from the verified JWT; `role` and the rest come from the
    profile row. Handlers should trust THIS, never client-supplied fields (§6).
    """

    id: str
    email: Optional[str] = None
    role: UserRole
    profile: Profile
