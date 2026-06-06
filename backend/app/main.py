"""FastAPI application entrypoint for the office-hour scheduler backend.

This is scaffolding only — no domain features are implemented yet. It exposes
a single ``/health`` endpoint so the dev server can be verified end-to-end.
"""

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user, require_active_user, require_admin
from app.config import get_settings
from app.reservations import ReservationError, SupabaseReservationRepo, create_reservation
from app.schemas import CurrentUser, Profile, ReservationCreate, ReservationOut
from app.slot_generator import cleanup_slots_before_current_month, generate_upcoming_months
from app.slot_generator import preview_cleanup_slots_before_current_month, preview_upcoming_months

settings = get_settings()

app = FastAPI(
    title="Office Hour Scheduler API",
    version="0.1.0",
)

# Allow the local Next.js dev server to call the API during development.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://localhost:\d+$",
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


@app.post("/reservations", response_model=ReservationOut)
def create_current_user_reservation(
    payload: ReservationCreate,
    user: CurrentUser = Depends(require_active_user),
) -> dict:
    """Book a slot for the current student (PROJECT_SPEC §5, §6)."""
    try:
        return create_reservation(payload, user, SupabaseReservationRepo())
    except ReservationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@app.get("/reservations", response_model=list[ReservationOut])
def list_current_user_reservations(
    user: CurrentUser = Depends(require_active_user),
) -> list[dict]:
    """Return the current user's own reservations."""
    return SupabaseReservationRepo().list_own_reservations(user.id)


@app.post("/reservations/{reservation_id}/cancel", response_model=ReservationOut)
def cancel_current_user_reservation(
    reservation_id: str,
    user: CurrentUser = Depends(require_active_user),
) -> dict:
    """Cancel the current user's active reservation, freeing the slot."""
    cancelled = SupabaseReservationRepo().cancel_reservation(reservation_id, user.id)
    if cancelled is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active reservation not found",
        )
    return cancelled


@app.post("/admin/time-slots/generate")
def admin_generate_time_slots(
    user: CurrentUser = Depends(require_admin),
) -> dict:
    """Generate the next two months of slots from the CSV schedule."""
    generated_weeks = generate_upcoming_months(months=2)
    return {
        "generated_weeks": [week.isoformat() for week in generated_weeks],
        "weeks_count": len(generated_weeks),
    }


@app.get("/admin/time-slots/generate/preview")
def admin_preview_generate_time_slots(
    user: CurrentUser = Depends(require_admin),
) -> dict:
    """Preview the next two months of CSV-generated weeks."""
    weeks = preview_upcoming_months(months=2)
    return {"weeks": weeks, "weeks_count": len(weeks)}


@app.post("/admin/time-slots/cleanup")
def admin_cleanup_time_slots(
    user: CurrentUser = Depends(require_admin),
) -> dict:
    """Delete slot rows before the current month."""
    deleted_count = cleanup_slots_before_current_month()
    return {"deleted_count": deleted_count}


@app.get("/admin/time-slots/cleanup/preview")
def admin_preview_cleanup_time_slots(
    user: CurrentUser = Depends(require_admin),
) -> dict:
    """Preview slot rows before the current month."""
    return preview_cleanup_slots_before_current_month()
