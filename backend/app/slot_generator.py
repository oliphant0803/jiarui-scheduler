"""Generate weekly office-hour slots in America/Toronto.

The generator follows PROJECT_SPEC §4 and the shared frontend CSV schedule.
It is intentionally idempotent: callers may run it repeatedly for the same
week and rely on the database UNIQUE constraint to avoid duplicates.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

TORONTO_TZ = ZoneInfo("America/Toronto")
DEFAULT_CSV_PATH = Path(__file__).resolve().parents[2] / "frontend" / "app" / "time-slots.csv"
FALLBACK_CSV = """day,slot 1,slot 2,slot 3,slot 4,slot 5,slot 6
Monday,18:30-19:00 TEF,19:00-19:30 TEF,19:30-20:00 TEF,20:00-20:30 TEF,,
Tuesday,18:30-19:00 TEF,19:00-19:30 TEF,19:30-20:00 TEF,20:00-20:30 TEF,,
Wednesday,18:00-18:30 TCF,18:30-19:00 TCF,19:00-19:30 TCF,19:30-20:00 TCF,20:00-20:30 TCF,20:30-21:00 TCF
Thursday,18:00-18:30 TCF,18:30-19:00 TCF,19:00-19:30 TCF,19:30-20:00 TCF,20:00-20:30 TCF,20:30-21:00 TCF
Friday,18:00-18:30 FLEX,18:30-19:00 FLEX,19:00-19:30 FLEX,19:30-20:00 FLEX,20:00-20:30 FLEX,20:30-21:00 FLEX
"""
DAY_OFFSETS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
}


@dataclass(frozen=True)
class SlotDraft:
    slot_date: date
    start_time: time
    end_time: time
    exam_type: str | None
    week_start: date

    def to_db_row(self) -> dict[str, str | None]:
        return {
            "slot_date": self.slot_date.isoformat(),
            "start_time": self.start_time.strftime("%H:%M:%S"),
            "end_time": self.end_time.strftime("%H:%M:%S"),
            "exam_type": self.exam_type,
            "week_start": self.week_start.isoformat(),
        }


@dataclass(frozen=True)
class SlotRule:
    day: str
    day_offset: int
    start_time: time
    end_time: time
    exam_type: str | None


class RawSupabaseTimeSlotClient:
    """Tiny REST client used by the generator when supabase-py rejects sb_secret keys."""

    def __init__(self, supabase_url: str, api_key: str) -> None:
        self.supabase_url = supabase_url.rstrip("/")
        self.api_key = api_key

    def table(self, name: str) -> "RawSupabaseTable":
        if name != "time_slots":
            raise ValueError("RawSupabaseTimeSlotClient only supports time_slots")
        return RawSupabaseTable(self.supabase_url, self.api_key, name)


class RawSupabaseTable:
    def __init__(self, supabase_url: str, api_key: str, table_name: str) -> None:
        self.supabase_url = supabase_url
        self.api_key = api_key
        self.table_name = table_name
        self.rows: list[dict[str, Any]] = []
        self.on_conflict = ""

    def upsert(self, rows: list[dict[str, Any]], on_conflict: str) -> "RawSupabaseTable":
        self.rows = rows
        self.on_conflict = on_conflict
        return self

    def execute(self) -> None:
        import httpx

        response = httpx.post(
            f"{self.supabase_url}/rest/v1/{self.table_name}",
            params={"on_conflict": self.on_conflict},
            headers={
                "apikey": self.api_key,
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=self.rows,
            timeout=30.0,
        )
        if response.is_error:
            raise RuntimeError(f"Supabase upsert failed: {response.status_code} {response.text}")

    def delete_before_slot_date(self, cutoff: date) -> int:
        import httpx

        base_url = f"{self.supabase_url}/rest/v1/{self.table_name}"
        headers = {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        params = {"slot_date": f"lt.{cutoff.isoformat()}"}
        count_response = httpx.get(
            base_url,
            params={**params, "select": "id"},
            headers={**headers, "Prefer": "count=exact"},
            timeout=30.0,
        )
        if count_response.is_error:
            raise RuntimeError(f"Supabase count failed: {count_response.status_code} {count_response.text}")

        content_range = count_response.headers.get("content-range", "0-0/0")
        count = int(content_range.rsplit("/", 1)[-1] or 0)

        delete_response = httpx.delete(
            base_url,
            params=params,
            headers={**headers, "Prefer": "return=minimal"},
            timeout=30.0,
        )
        if delete_response.is_error:
            raise RuntimeError(f"Supabase cleanup failed: {delete_response.status_code} {delete_response.text}")

        return count

    def list_before_slot_date(self, cutoff: date) -> list[dict[str, Any]]:
        import httpx

        response = httpx.get(
            f"{self.supabase_url}/rest/v1/{self.table_name}",
            params={
                "slot_date": f"lt.{cutoff.isoformat()}",
                "select": "id,slot_date,start_time,end_time,exam_type,week_start",
                "order": "slot_date.asc,start_time.asc",
            },
            headers={
                "apikey": self.api_key,
                "Authorization": f"Bearer {self.api_key}",
            },
            timeout=30.0,
        )
        if response.is_error:
            raise RuntimeError(f"Supabase cleanup preview failed: {response.status_code} {response.text}")
        return response.json()


def normalize_week_start(week_start: date | datetime | str) -> date:
    """Return the Monday date for a target week."""
    if isinstance(week_start, str):
        parsed = date.fromisoformat(week_start)
    elif isinstance(week_start, datetime):
        parsed = week_start.astimezone(TORONTO_TZ).date()
    else:
        parsed = week_start

    return parsed - timedelta(days=parsed.weekday())


def parse_time_slot_csv(csv_text: str) -> list[SlotRule]:
    """Parse explicit slot columns from frontend/app/time-slots.csv."""
    rules: list[SlotRule] = []
    for raw_line in csv_text.splitlines():
        line = raw_line.strip()
        if not line or line.lower().startswith("day,"):
            continue

        raw_day, *raw_slots = line.split(",")
        day = raw_day.strip()
        day_offset = DAY_OFFSETS.get(day.lower())
        if day_offset is None:
            raise ValueError(f"Unknown day in time-slots.csv: {day}")

        for raw_slot in raw_slots:
            slot_text = raw_slot.strip()
            if not slot_text:
                continue

            parts = slot_text.split()
            if len(parts) != 2 or "-" not in parts[0]:
                raise ValueError(f"Invalid slot for {day}: {slot_text}")

            start_text, end_text = parts[0].split("-", 1)
            start_time = parse_clock(start_text)
            end_time = parse_clock(end_text)
            if datetime.combine(date.today(), end_time) - datetime.combine(date.today(), start_time) != timedelta(minutes=30):
                raise ValueError(f"Each CSV slot must be 30 minutes: {day} {slot_text}")

            exam = parts[1].upper()
            if exam not in {"TEF", "TCF", "FLEX"}:
                raise ValueError(f"Invalid exam type for {day}: {slot_text}")

            rules.append(
                SlotRule(
                    day=day,
                    day_offset=day_offset,
                    start_time=start_time,
                    end_time=end_time,
                    exam_type=None if exam == "FLEX" else exam,
                )
            )

    return sorted(rules, key=lambda rule: (rule.day_offset, rule.start_time))


def parse_clock(value: str) -> time:
    hour_text, minute_text = value.split(":", 1)
    return time(int(hour_text), int(minute_text))


def load_slot_rules(csv_path: Path | str | None = None) -> list[SlotRule]:
    path = Path(csv_path) if csv_path is not None else DEFAULT_CSV_PATH
    csv_text = path.read_text(encoding="utf-8") if path.exists() else FALLBACK_CSV
    return parse_time_slot_csv(csv_text)


def build_week_slots(
    week_start: date | datetime | str,
    rules: list[SlotRule] | None = None,
) -> list[SlotDraft]:
    """Build Mon-Fri slot drafts for a target week from the CSV rules."""
    monday = normalize_week_start(week_start)
    slot_rules = rules if rules is not None else load_slot_rules()
    drafts: list[SlotDraft] = []
    for rule in slot_rules:
        drafts.append(
            SlotDraft(
                slot_date=monday + timedelta(days=rule.day_offset),
                start_time=rule.start_time,
                end_time=rule.end_time,
                exam_type=rule.exam_type,
                week_start=monday,
            )
        )

    return drafts


def next_target_week_start(now: datetime | None = None) -> date:
    """Return the target week whose slots should exist for the current cycle."""
    if now is None:
        now = datetime.now(TORONTO_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=TORONTO_TZ)
    else:
        now = now.astimezone(TORONTO_TZ)

    this_monday = now.date() - timedelta(days=now.weekday())
    rollover = datetime.combine(this_monday, time(12, 0), tzinfo=TORONTO_TZ)
    if now < rollover:
        return this_monday
    return this_monday + timedelta(days=7)


def generate_week(
    week_start: date | datetime | str,
    client=None,
    rules: list[SlotRule] | None = None,
) -> int:
    """Generate a target week, returning the number of drafted slot rows.

    The Supabase upsert relies on ``time_slots_day_time_key``; repeated runs
    do not create duplicate rows and future generated slots stay in sync with
    CSV edits.
    """
    if client is None:
        client = get_slot_generation_client()

    rows = [slot.to_db_row() for slot in build_week_slots(week_start, rules=rules)]
    if not rows:
        return 0

    (
        client.table("time_slots")
        .upsert(rows, on_conflict="slot_date,start_time")
        .execute()
    )
    return len(rows)


def generate_upcoming_weeks(
    weeks: int = 8,
    client=None,
    now: datetime | None = None,
    csv_path: Path | str | None = None,
) -> list[date]:
    """Generate a rolling set of future target weeks from the CSV schedule."""
    if client is None:
        client = get_slot_generation_client()

    start = next_target_week_start(now)
    rules = load_slot_rules(csv_path)
    generated: list[date] = []
    for index in range(weeks):
        target = start + timedelta(days=7 * index)
        generate_week(target, client=client, rules=rules)
        generated.append(target)
    return generated


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def generate_upcoming_months(
    months: int = 2,
    client=None,
    now: datetime | None = None,
    csv_path: Path | str | None = None,
) -> list[date]:
    """Generate target weeks whose Mon-Fri slots fall in the next N months."""
    if months < 1:
        raise ValueError("months must be at least 1")
    if client is None:
        client = get_slot_generation_client()

    if now is None:
        now = datetime.now(TORONTO_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=TORONTO_TZ)
    else:
        now = now.astimezone(TORONTO_TZ)

    month_start = date(now.year, now.month, 1)
    end_exclusive = add_months(month_start, months)
    rules = load_slot_rules(csv_path)

    target = normalize_week_start(next_target_week_start(now))
    generated: list[date] = []
    while target < end_exclusive:
        generate_week(target, client=client, rules=rules)
        generated.append(target)
        target += timedelta(days=7)

    return generated


def preview_upcoming_months(
    months: int = 2,
    now: datetime | None = None,
    csv_path: Path | str | None = None,
) -> list[dict[str, str | int]]:
    """Return weeks and slot counts that would be generated from the CSV."""
    if months < 1:
        raise ValueError("months must be at least 1")

    if now is None:
        now = datetime.now(TORONTO_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=TORONTO_TZ)
    else:
        now = now.astimezone(TORONTO_TZ)

    month_start = date(now.year, now.month, 1)
    end_exclusive = add_months(month_start, months)
    rules = load_slot_rules(csv_path)

    target = normalize_week_start(next_target_week_start(now))
    preview: list[dict[str, str | int]] = []
    while target < end_exclusive:
        slots = build_week_slots(target, rules=rules)
        preview.append(
            {
                "week_start": target.isoformat(),
                "week_end": (target + timedelta(days=4)).isoformat(),
                "slots_count": len(slots),
            }
        )
        target += timedelta(days=7)

    return preview


def cleanup_slots_before_current_month(client=None, now: datetime | None = None) -> int:
    """Delete time_slots whose dates are completely before the current month."""
    if client is None:
        client = get_slot_generation_client()
    if now is None:
        now = datetime.now(TORONTO_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=TORONTO_TZ)
    else:
        now = now.astimezone(TORONTO_TZ)

    cutoff = date(now.year, now.month, 1)
    table = client.table("time_slots")
    if hasattr(table, "delete_before_slot_date"):
        return table.delete_before_slot_date(cutoff)

    resp = (
        table.select("id", count="exact")
        .lt("slot_date", cutoff.isoformat())
        .execute()
    )
    count = int(resp.count or 0)
    table.delete().lt("slot_date", cutoff.isoformat()).execute()
    return count


def preview_cleanup_slots_before_current_month(client=None, now: datetime | None = None) -> dict[str, Any]:
    """Return slot rows before the current month without deleting them."""
    if client is None:
        client = get_slot_generation_client()
    if now is None:
        now = datetime.now(TORONTO_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=TORONTO_TZ)
    else:
        now = now.astimezone(TORONTO_TZ)

    cutoff = date(now.year, now.month, 1)
    table = client.table("time_slots")
    if hasattr(table, "list_before_slot_date"):
        rows = table.list_before_slot_date(cutoff)
    else:
        resp = (
            table.select("id,slot_date,start_time,end_time,exam_type,week_start")
            .lt("slot_date", cutoff.isoformat())
            .order("slot_date")
            .order("start_time")
            .execute()
        )
        rows = resp.data or []

    grouped: dict[str, int] = {}
    for row in rows:
        month = str(row["slot_date"])[:7]
        grouped[month] = grouped.get(month, 0) + 1

    return {
        "cutoff": cutoff.isoformat(),
        "slots_count": len(rows),
        "months": [{"month": month, "slots_count": count} for month, count in sorted(grouped.items())],
        "slots": rows,
    }


def generate_next_target_week(client=None, now: datetime | None = None) -> date:
    """Scheduled-job entrypoint: ensure the next cycle target week exists."""
    from app.config import get_settings

    timezone = get_settings().timezone
    if timezone != "America/Toronto":
        # The spec is explicit; keep the job honest even if env defaults drift.
        raise RuntimeError("TIMEZONE must be America/Toronto for slot generation")

    target = next_target_week_start(now)
    generate_week(target, client=client)
    return target


def get_slot_generation_client():
    """Return a Supabase client for time_slots generation.

    supabase-py 2.11 rejects newer `sb_secret_...` keys locally. For this cron
    job we can safely use raw PostgREST with the same server-side key.
    """
    from app.config import get_settings

    settings = get_settings()
    key = settings.supabase_service_role_key
    if key.startswith("sb_secret_"):
        return RawSupabaseTimeSlotClient(settings.supabase_url, key)

    from app.supabase_client import get_service_client

    return get_service_client()
