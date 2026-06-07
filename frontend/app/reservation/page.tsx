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
  nextTargetWeekMondayKey,
  weekMondayForKey,
  weekRangeLabel,
} from "../calendar-data";
import { TalkingBrandHeader } from "../talking-brand-header";
import { WeekNav } from "../week-nav";

function keyToDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
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
  const minMonday = currentWeekMondayKey(now);
  const maxMonday = addDays(minMonday, 7);
  // The upcoming bookable week is the default; navigation is limited to the
  // current week and the next week.
  const defaultMonday = nextTargetWeekMondayKey(now);
  const requestedWeek = (await searchParams)?.week;
  const requestedMonday = (requestedWeek ? weekMondayForKey(requestedWeek) : null) ?? defaultMonday;
  const selectedMonday =
    requestedMonday < minMonday ? minMonday : requestedMonday > maxMonday ? maxMonday : requestedMonday;
  const isDefaultWeek = selectedMonday === defaultMonday;
  const isCurrentWeekView = selectedMonday === minMonday;
  const slots = await loadCalendarSlots(now, selectedMonday);
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

  // Fetch which slots are booked by any student (without revealing who booked them)
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  let bookedSlotKeys = new Set<string>();
  try {
    const bookedResponse = await fetch(`${apiBase}/slots/booked?start_date=${startKey}&end_date=${endKey}`, {
      headers: {
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
      },
    });
    if (bookedResponse.ok) {
      const bookedData = await bookedResponse.json();
      // Create a set of "dayKey time" keys for quick lookup
      bookedSlotKeys = new Set(
        (bookedData.booked_slots ?? []).map((slot: { slot_date: string; start_time: string }) =>
          `${slot.slot_date} ${slot.start_time.slice(0, 5)}`
        )
      );
    }
  } catch {
    // If the API call fails, continue without booked slots info
  }

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
          isCurrentWeekView={isCurrentWeekView}
        />
        <div className="scheduler-topbar">
          <div>
            <p className="eyebrow">Toronto time · {currentTorontoLabel(now)}</p>
            <h1>{isDefaultWeek ? "Reserve next week" : "View week"}</h1>
            <p className="scheduler-sub">
              {weekRangeLabel(slots)} ·{" "}
              {isDefaultWeek ? "30-minute office hours" : "read-only — booking is open for next week only"}
            </p>
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

        <WeekNav
          basePath="/reservation"
          currentMonday={selectedMonday}
          defaultMonday={defaultMonday}
          minMonday={minMonday}
          maxMonday={maxMonday}
          rangeLabel={weekRangeLabel(slots)}
        />

        <CalendarGrid
          slots={slots}
          editable={isDefaultWeek}
          myReservations={myReservations}
          bookedSlotKeys={Array.from(bookedSlotKeys)}
          disablePastDays
          studentIdentity={{
            fullName: profile?.full_name ?? null,
            wechat: profile?.wechat ?? null,
          }}
        />
      </section>
    </main>
  );
}
