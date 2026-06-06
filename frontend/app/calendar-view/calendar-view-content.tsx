import Link from "next/link";

import { CalendarGrid } from "../calendar-grid";
import { loadCalendarSlots } from "../calendar-schedule";
import {
  currentTorontoLabel,
  getBookingPhase,
  getCalendarNow,
  weekRangeLabel,
} from "../calendar-data";
import { TalkingBrandHeader } from "../talking-brand-header";

export async function CalendarViewContent() {
  const now = getCalendarNow();
  const slots = await loadCalendarSlots(now);
  const phase = getBookingPhase(now);

  return (
    <main className="scheduler-page">
      <section className="scheduler-panel">
        <TalkingBrandHeader phase={phase} loggedIn={false} />
        <div className="scheduler-topbar">
          <div>
            <p className="eyebrow">Toronto time · {currentTorontoLabel(now)}</p>
            <h1>Calendar view</h1>
            <p className="scheduler-sub">
              {weekRangeLabel(slots)} · read-only next-week schedule
            </p>
          </div>
          <Link href="/reservation" className="btn compact-action">
            Book a slot
          </Link>
        </div>

        <CalendarGrid slots={slots} editable={false} />
      </section>
    </main>
  );
}
