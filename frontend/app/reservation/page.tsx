import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "../account-menu";
import { CalendarGrid, type MyReservation } from "../calendar-grid";
import { loadCalendarSlots } from "../calendar-schedule";
import {
  addDays,
  currentTorontoLabel,
  currentWeekMondayKey,
  dayLabel,
  getBookingPhase,
  getCalendarNow,
  weekRangeLabel,
} from "../calendar-data";
import { TalkingBrandHeader } from "../talking-brand-header";

function keyToDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export default async function ReservationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone, wechat, role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") {
    redirect("/manage");
  }

  const now = getCalendarNow();
  const slots = await loadCalendarSlots(now);
  const phase = getBookingPhase(now);

  // The student's own active reservations for the displayed week, so the grid
  // can mark them and the booking limits can be enforced in the UI. RLS lets a
  // student read only their own reservations.
  const startKey = slots[0]?.dayKey ?? "";
  const endKey = slots[slots.length - 1]?.dayKey ?? "";
  const { data: reservationRows } = await supabase
    .from("reservations")
    .select("id, topic, exam_type, slot_date, time_slots(start_time)")
    .eq("student_id", user.id)
    .eq("status", "active")
    .gte("slot_date", startKey)
    .lte("slot_date", endKey);

  const myReservations: MyReservation[] = (reservationRows ?? []).map((row) => {
    const ts = row.time_slots as unknown as { start_time?: string } | { start_time?: string }[] | null;
    const startTime = Array.isArray(ts) ? ts[0]?.start_time : ts?.start_time;
    const dayKey = String(row.slot_date);
    return {
      dayKey,
      start: (startTime ?? "00:00:00").slice(0, 5),
      topic: String(row.topic),
      examType: String(row.exam_type),
      dayLabel: dayLabel(keyToDate(dayKey)),
    };
  });

  // When booking is locked, tell the student when they can return.
  const thursdayKey = addDays(currentWeekMondayKey(now), 3);
  const comeBackLabel = dayLabel(keyToDate(thursdayKey));

  // Has the student booked every bookable day of the week? (one per day, Mon–Fri)
  const weekDayKeys = new Set(slots.map((s) => s.dayKey));
  const bookedDayKeys = new Set(myReservations.map((r) => r.dayKey));
  const allDaysBooked = weekDayKeys.size > 0 && bookedDayKeys.size >= weekDayKeys.size;
  const weekLabel = weekRangeLabel(slots);

  return (
    <main className="scheduler-page">
      <section className="scheduler-panel">
        <TalkingBrandHeader
          phase={phase}
          loggedIn
          reservations={myReservations}
          comeBackLabel={comeBackLabel}
          allDaysBooked={allDaysBooked}
          weekLabel={weekLabel}
        />
        <div className="scheduler-topbar">
          <div>
            <p className="eyebrow">Toronto time · {currentTorontoLabel(now)}</p>
            <h1>Reserve next week</h1>
            <p className="scheduler-sub">{weekRangeLabel(slots)} · 30-minute office hours</p>
          </div>
          <div className="topbar-actions">
            <AccountMenu
              fallbackEmail={user.email}
              profile={{
                full_name: profile?.full_name ?? null,
                email: profile?.email ?? user.email ?? null,
                phone: profile?.phone ?? null,
                wechat: profile?.wechat ?? null,
              }}
            />
          </div>
        </div>

        <CalendarGrid
          slots={slots}
          editable
          myReservations={myReservations}
          studentIdentity={{
            fullName: profile?.full_name ?? null,
            wechat: profile?.wechat ?? null,
          }}
        />
      </section>
    </main>
  );
}
