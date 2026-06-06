"""Cron-friendly slot generation job.

Run from the backend directory with:
    python -m scripts.generate_time_slots --weeks 8
"""

from __future__ import annotations

import argparse

from app.slot_generator import generate_upcoming_weeks


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate future Supabase time slots from the CSV schedule.")
    parser.add_argument(
        "--weeks",
        type=int,
        default=8,
        help="Number of upcoming target weeks to generate. Monthly cron should use 8.",
    )
    parser.add_argument(
        "--csv",
        default=None,
        help="Optional path to a time-slots.csv file. Defaults to frontend/app/time-slots.csv.",
    )
    args = parser.parse_args()

    targets = generate_upcoming_weeks(weeks=args.weeks, csv_path=args.csv)
    print("Generated time slots for target weeks:")
    for target in targets:
        print(f"- {target.isoformat()}")


if __name__ == "__main__":
    main()
