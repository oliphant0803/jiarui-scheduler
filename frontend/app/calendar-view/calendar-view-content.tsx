import { CalendarGrid } from "../calendar-grid";
import { loadCalendarSlots } from "../calendar-schedule";
import {
  addDays,
  currentWeekMondayKey,
  currentTorontoLabel,
  getBookingPhase,
  getCalendarNow,
  nextTargetWeekMondayKey,
  weekMondayForKey,
  weekRangeLabel,
} from "../calendar-data";
import { TalkingBrandHeader } from "../talking-brand-header";
import { WeekNav } from "../week-nav";
import AutoRefresh from "../reservation/auto-refresh";

type ReservationInfo = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  topic: string;
  exam_type: string;
  student_name: string | null;
  student_wechat: string | null;
};

export async function CalendarViewContent({ requestedWeek }: { requestedWeek?: string }) {
  const now = getCalendarNow();
  const minMonday = currentWeekMondayKey(now);
  const maxMonday = addDays(minMonday, 7);
  const defaultMonday = nextTargetWeekMondayKey(now);
  const requestedMonday = (requestedWeek ? weekMondayForKey(requestedWeek) : null) ?? defaultMonday;
  const selectedMonday =
    requestedMonday < minMonday ? minMonday : requestedMonday > maxMonday ? maxMonday : requestedMonday;
  const slots = await loadCalendarSlots(now, selectedMonday);
  const phase = getBookingPhase(now);

  // Fetch reservations with student info from the API
  const startKey = slots[0]?.dayKey ?? "";
  const endKey = slots[slots.length - 1]?.dayKey ?? "";
  let reservations: ReservationInfo[] = [];
  let bookedSlotKeys: string[] = [];

  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    const response = await fetch(`${apiBase}/calendar-view/reservations?start_date=${startKey}&end_date=${endKey}`);
    if (response.ok) {
      const data = await response.json();
      reservations = data.reservations ?? [];
      bookedSlotKeys = (data.reservations ?? []).map(
        (res: ReservationInfo) =>
          `${res.slot_date} ${res.start_time.slice(0, 5)}`
      );
    }
  } catch {
    // If the API call fails, continue without reservation data
  }

  return (
    <main className="scheduler-page">
      <AutoRefresh />
      <section className="scheduler-panel">
        <TalkingBrandHeader phase={phase} loggedIn={false} />
        <div className="scheduler-topbar">
          <div>
            <p className="eyebrow">Toronto time · {currentTorontoLabel(now)}</p>
            <h1>Calendar view</h1>
            <p className="scheduler-sub">
              {weekRangeLabel(slots)} · read-only schedule
            </p>
          </div>
        </div>

        <WeekNav
          basePath="/calendar-view"
          currentMonday={selectedMonday}
          defaultMonday={defaultMonday}
          minMonday={minMonday}
          maxMonday={maxMonday}
          rangeLabel={weekRangeLabel(slots)}
        />

        <CalendarGrid
          slots={slots}
          editable={false}
          bookedSlotKeys={bookedSlotKeys}
          reservationsInfo={reservations}
          isPublicView={true}
          disablePastDays
        />
      </section>
    </main>
  );
}
