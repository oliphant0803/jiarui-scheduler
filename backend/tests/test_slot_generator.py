from __future__ import annotations

from collections import Counter
from datetime import date, datetime
import unittest
from zoneinfo import ZoneInfo

from app.slot_generator import (
    build_week_slots,
    generate_week,
    parse_time_slot_csv,
    next_target_week_start,
)


class FakeExecute:
    def __init__(self, table: "FakeTable") -> None:
        self.table = table

    def execute(self) -> None:
        for row in self.table.pending:
            key = (row["slot_date"], row["start_time"])
            self.table.rows[key] = row


class FakeTable:
    def __init__(self) -> None:
        self.rows: dict[tuple[str, str], dict] = {}
        self.pending: list[dict] = []

    def upsert(self, rows, on_conflict: str):
        assert on_conflict == "slot_date,start_time"
        self.pending = rows
        return FakeExecute(self)


class FakeClient:
    def __init__(self) -> None:
        self.time_slots = FakeTable()

    def table(self, name: str) -> FakeTable:
        assert name == "time_slots"
        return self.time_slots


class SlotGeneratorTests(unittest.TestCase):
    def test_build_week_slots_exact_counts_per_day(self) -> None:
        slots = build_week_slots(date(2026, 6, 8))
        counts = Counter(slot.slot_date.weekday() for slot in slots)

        self.assertEqual(counts[0], 4)
        self.assertEqual(counts[1], 4)
        self.assertEqual(counts[2], 6)
        self.assertEqual(counts[3], 6)
        self.assertEqual(counts[4], 6)
        self.assertEqual(len(slots), 26)

        friday = [slot for slot in slots if slot.slot_date.weekday() == 4]
        self.assertEqual({slot.exam_type for slot in friday}, {None})

    def test_csv_supports_non_contiguous_slots(self) -> None:
        rules = parse_time_slot_csv(
            "day,slot 1,slot 2\n"
            "Monday,13:00-13:30 TEF,18:00-18:30 TEF\n"
        )
        slots = build_week_slots(date(2026, 6, 8), rules=rules)

        self.assertEqual([slot.start_time.strftime("%H:%M") for slot in slots], ["13:00", "18:00"])

    def test_generate_week_is_idempotent_with_unique_day_start_constraint(self) -> None:
        client = FakeClient()

        self.assertEqual(generate_week(date(2026, 6, 8), client=client), 26)
        self.assertEqual(len(client.time_slots.rows), 26)

        self.assertEqual(generate_week(date(2026, 6, 8), client=client), 26)
        self.assertEqual(len(client.time_slots.rows), 26)

    def test_next_target_week_rolls_over_at_monday_noon_toronto(self) -> None:
        tz = ZoneInfo("America/Toronto")

        before_noon = datetime(2026, 6, 8, 11, 59, tzinfo=tz)
        at_noon = datetime(2026, 6, 8, 12, 0, tzinfo=tz)

        self.assertEqual(next_target_week_start(before_noon), date(2026, 6, 8))
        self.assertEqual(next_target_week_start(at_noon), date(2026, 6, 15))
