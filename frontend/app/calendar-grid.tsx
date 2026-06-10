"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  CalendarSlot,
  ExamType,
  Topic,
  currentTorontoDateKey,
  dayLabel,
  examTypes,
  getBookingPhase,
  getCalendarNow,
  minutesToTime,
  topics,
  timeToMinutes,
} from "./calendar-data";

export type MyReservation = {
  dayKey: string;
  start: string;
  topic: string;
  examType: string;
  dayLabel: string;
};

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

type Props = {
  slots: CalendarSlot[];
  editable: boolean;
  myReservations?: MyReservation[];
  bookedSlotKeys?: string[];
  reservationsInfo?: ReservationInfo[];
  isPublicView?: boolean;
  disablePastDays?: boolean;
  studentIdentity?: {
    fullName: string | null;
    wechat: string | null;
  };
};

export function CalendarGrid({
  slots,
  editable,
  myReservations = [],
  bookedSlotKeys = [],
  reservationsInfo = [],
  isPublicView = false,
  disablePastDays = false,
  studentIdentity,
}: Props) {
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedReservationInfo, setSelectedReservationInfo] = useState<ReservationInfo | null>(null);
  const [topic, setTopic] = useState<Topic>("Speaking");
  const [examType, setExamType] = useState<ExamType>("TEF");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const phase = getBookingPhase(getCalendarNow());
  const todayKey = currentTorontoDateKey(getCalendarNow());
  const canBook = editable && (phase === "phase1" || phase === "phase2");
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null;
  const hasReservationIdentity = Boolean(studentIdentity?.fullName && studentIdentity?.wechat);

  // Create a map of reservations by slot key for quick lookup
  const reservationsBySlotKey = useMemo(() => {
    const map = new Map<string, ReservationInfo>();
    for (const res of reservationsInfo) {
      const key = `${res.slot_date} ${res.start_time.slice(0, 5)}`;
      map.set(key, res);
    }
    return map;
  }, [reservationsInfo]);

  // Reflect the student's own reservations and the per-phase booking limits:
  //  - a slot the student already booked is "mine" (highlighted, not bookable);
  //  - phase 1 (Mon noon–Wed noon) allows ONE booking for the whole week, so any
  //    existing reservation locks every other slot;
  //  - phase 2 allows one per day, so a day with a reservation locks that day.
  const mineByKey = useMemo(() => {
    const map = new Map<string, MyReservation>();
    for (const r of myReservations) map.set(`${r.dayKey} ${r.start}`, r);
    return map;
  }, [myReservations]);
  const reservedDays = useMemo(
    () => new Set(myReservations.map((r) => r.dayKey)),
    [myReservations],
  );
  const weekLocked = phase === "phase1" && myReservations.length > 0;

  function selectSlot(slotId: string) {
    setSelectedSlotId(slotId);
    setIdentityConfirmed(false);
    setConfirming(false);
    setSubmitError(null);
    setSubmitMessage(null);
  }

  useEffect(() => {
    if (!selectedSlot && !selectedReservationInfo) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setSelectedSlotId(null);
      setSelectedReservationInfo(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedSlot, selectedReservationInfo]);

  const days = useMemo(() => {
    const grouped = new Map<string, CalendarSlot[]>();
    for (const slot of slots) {
      grouped.set(slot.dayKey, [...(grouped.get(slot.dayKey) ?? []), slot]);
    }
    return Array.from(grouped.entries()).map(([dayKey, daySlots]) => ({
      dayKey,
      label: dayLabel(daySlots[0].date),
      slots: daySlots,
    }));
  }, [slots]);

  const timeRows = useMemo(() => {
    if (!slots.length) return [];
    const starts = slots.map((slot) => timeToMinutes(slot.start));
    const ends = slots.map((slot) => timeToMinutes(slot.end));
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    const rows: string[] = [];
    for (let current = min; current < max; current += 30) {
      rows.push(minutesToTime(current));
    }
    return rows;
  }, [slots]);

  async function reserveSelectedSlot() {
    if (!selectedSlot) return;
    if (!identityConfirmed) {
      setSubmitError("Please confirm your full name and WeChat ID before reserving.");
      return;
    }
    if (!hasReservationIdentity) {
      setSubmitError("Your full name and WeChat ID are required before booking.");
      return;
    }

    setSubmitting(true);
    setSubmitMessage(null);
    setSubmitError(null);

    const supabase = createClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setSubmitError("Please log in again before reserving a slot.");
      setSubmitting(false);
      return;
    }

    const { data: slotRow, error: slotError } = await supabase
      .from("time_slots")
      .select("id")
      .eq("slot_date", selectedSlot.dayKey)
      .eq("start_time", `${selectedSlot.start}:00`)
      .limit(1)
      .maybeSingle();

    if (slotError || !slotRow?.id) {
      setSubmitError("This slot has not been generated in the database yet.");
      setSubmitting(false);
      return;
    }

    const body: { slot_id: string; topic: Topic; exam_type?: ExamType } = {
      slot_id: slotRow.id,
      topic,
    };
    if (selectedSlot.flexible) {
      body.exam_type = examType;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}/reservations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setSubmitError(result?.detail ?? "Could not reserve this slot.");
        return;
      }

      setSubmitMessage("Reserved. Your slot is saved.");
      setSelectedSlotId(null);
      // Re-render the server component so the new reservation is reflected in
      // the grid (marked "mine") and the booking limits lock accordingly.
      router.refresh();
    } catch {
      setSubmitError("Could not reach the reservation server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="calendar-shell">
      <aside className="time-rail" aria-hidden="true">
        <span />
        {timeRows.map((time) => (
          <span key={time}>{time}</span>
        ))}
      </aside>
      <div className="calendar-days">
        {days.map((day) => (
          <section className="calendar-day" key={day.dayKey}>
            <header className="calendar-day-head">
              <span>{day.label.split(",")[0]}</span>
              <strong>{day.label.split(",")[1]?.trim()}</strong>
            </header>
            <div className="calendar-slots">
              {timeRows.map((time) => {
                const slot = day.slots.find((candidate) => candidate.start === time);
                if (!slot) {
                  return <div className="calendar-empty-slot" key={`${day.dayKey}-${time}`} />;
                }

                const isSelected = selectedSlotId === slot.id;
                const mine = mineByKey.get(`${slot.dayKey} ${slot.start}`);
                const isMine = Boolean(mine);
                const isBooked = bookedSlotKeys.includes(`${slot.dayKey} ${slot.start}`);
                const isPastDay = disablePastDays && slot.dayKey < todayKey;
                const dayLocked = !isMine && reservedDays.has(slot.dayKey);
                const lockedOut = !isMine && (weekLocked || dayLocked || isBooked);
                const selectable = canBook && !isPastDay && !isMine && !lockedOut;
                
                // Get reservation info if slot is booked
                const slotKey = `${slot.dayKey} ${slot.start}`;
                const bookedReservation = reservationsBySlotKey.get(slotKey);
                
                // A booked slot shows the exam type the student actually confirmed
                // (so a flexible Friday slot reads "TEF" or "TCF", not "TEF / TCF").
                const label = mine
                  ? mine.examType
                  : isBooked && isPublicView && bookedReservation
                    ? bookedReservation.student_name || "Booked"
                    : slot.flexible
                      ? "TEF / TCF"
                      : slot.examType;

                const statusText = isMine
                  ? isPastDay
                    ? "✓ Completed"
                    : "✓ Your booking"
                  : isBooked && isPublicView && bookedReservation
                    ? `${bookedReservation.exam_type} · ${bookedReservation.topic}`
                    : isBooked
                      ? "Booked"
                      : isPastDay
                        ? "Past"
                      : !editable
                        ? "Open"
                        : lockedOut
                          ? "Locked"
                          : canBook
                            ? "Select time"
                            : "View only";

                const publicViewBooked = isBooked && isPublicView;
                const classNames = `calendar-slot ${isSelected ? "is-selected" : ""} ${isPastDay ? "is-past-day" : ""} ${isPastDay && isMine ? "is-completed-booking" : ""} ${isMine ? "is-mine" : ""} ${publicViewBooked ? "admin-slot is-reserved" : isBooked ? "is-booked" : ""} ${lockedOut && !isBooked ? "is-locked" : ""}`;

                return (
                  <button
                    type="button"
                    key={slot.id}
                    className={classNames}
                    data-exam={isMine ? "MINE" : slot.examType ?? "FLEX"}
                    onClick={() => {
                      if (selectable) {
                        selectSlot(slot.id);
                      } else if (!editable && isBooked) {
                        // In read-only mode, allow viewing booked slot info
                        const resInfo = reservationsInfo.find(
                          (r) =>
                            r.slot_date === slot.dayKey &&
                            r.start_time.slice(0, 5) === slot.start
                        );
                        if (resInfo) {
                          setSelectedReservationInfo(resInfo);
                          setSelectedSlotId(slot.id);
                        }
                      }
                    }}
                    disabled={isPastDay || (!selectable && !((!editable && isBooked) || isMine))}
                  >
                    <span className="slot-time">
                      {slot.start} - {slot.end}
                    </span>
                    <span className="slot-type">{label}</span>
                    <span className="slot-status">{statusText}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {editable && selectedSlot && (
        <div
          className="booking-popover"
          role="dialog"
          aria-label="Reservation details"
          ref={popoverRef}
        >
          <div className="booking-popover-body">
            <div className="booking-fields">
              <div>
                <p className="popover-kicker">Selected time</p>
                <h2>
                  {dayLabel(selectedSlot.date)} · {selectedSlot.start}
                </h2>
              </div>
              <label className="field compact-field">
                <span className="label">Topic</span>
                <select className="input" value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>
                  {topics.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="field compact-field">
                <span className="label">Course</span>
                <select
                  className="input"
                  value={selectedSlot.flexible ? examType : selectedSlot.examType ?? examType}
                  onChange={(e) => setExamType(e.target.value as ExamType)}
                  disabled={!selectedSlot.flexible}
                >
                  {(selectedSlot.flexible ? examTypes : [selectedSlot.examType ?? "TEF"]).map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <aside className="reservation-identity-card">
              <p className="popover-kicker">Reserved as</p>
              <dl>
                <div>
                  <dt>Full name</dt>
                  <dd>{studentIdentity?.fullName || "Missing"}</dd>
                </div>
                <div>
                  <dt>WeChat ID</dt>
                  <dd>{studentIdentity?.wechat || "Missing"}</dd>
                </div>
              </dl>
              <p className="identity-help">
                Can&apos;t edit here. If you want to modify them, use the{" "}
                <strong>View full information</strong> button.
              </p>
              <label className="confirm-identity-row">
                <input
                  type="checkbox"
                  checked={identityConfirmed}
                  onChange={(event) => setIdentityConfirmed(event.target.checked)}
                  disabled={!hasReservationIdentity}
                />
                Confirm these details for my reservation.
              </label>
            </aside>
          </div>

          <div className="identity-preview">
            <span>Name and WeChat come from your account.</span>
            <strong>
              {selectedSlot.flexible ? examType : selectedSlot.examType} · {topic}
            </strong>
          </div>
          {submitError && <div className="alert alert-error compact-alert">{submitError}</div>}
          {submitMessage && <div className="alert alert-success compact-alert">{submitMessage}</div>}

          {confirming ? (
            <div className="reserve-confirm" role="alertdialog" aria-label="Confirm reservation">
              <p className="reserve-confirm-text">
                <span className="reserve-confirm-mark" aria-hidden="true">
                  !
                </span>
                <span>
                  This booking is <strong>final</strong> — you won&apos;t be able to
                  change or move it yourself. Please double-check the{" "}
                  <strong>day, time, topic, and course</strong> below.
                </span>
              </p>
              <p className="reserve-confirm-summary">
                {dayLabel(selectedSlot.date)} · {selectedSlot.start} —{" "}
                {selectedSlot.flexible ? examType : selectedSlot.examType} · {topic}
              </p>
              <div className="reserve-confirm-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={reserveSelectedSlot}
                  disabled={submitting}
                >
                  {submitting ? "Reserving..." : "Yes, reserve it"}
                </button>
                <button
                  className="reserve-confirm-back"
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                >
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!identityConfirmed || !hasReservationIdentity}
            >
              Reserve this slot
            </button>
          )}
        </div>
      )}

      {!editable && selectedReservationInfo && (
        <div
          className="booking-popover"
          role="dialog"
          aria-label="Reservation details"
          ref={popoverRef}
        >
          <div className="booking-popover-body">
            <div className="booking-fields">
              <div>
                <p className="popover-kicker">Booked slot</p>
                <h2>
                  {dayLabel(new Date(Date.UTC(
                    parseInt(selectedReservationInfo.slot_date.split("-")[0]),
                    parseInt(selectedReservationInfo.slot_date.split("-")[1]) - 1,
                    parseInt(selectedReservationInfo.slot_date.split("-")[2]),
                    12
                  )))} · {selectedReservationInfo.start_time.slice(0, 5)}
                </h2>
              </div>
              <div className="field compact-field">
                <span className="label">Topic</span>
                <div className="input" style={{ padding: "0.625rem 0.75rem", background: "#f5f5f5" }}>
                  {selectedReservationInfo.topic}
                </div>
              </div>
              <div className="field compact-field">
                <span className="label">Course</span>
                <div className="input" style={{ padding: "0.625rem 0.75rem", background: "#f5f5f5" }}>
                  {selectedReservationInfo.exam_type}
                </div>
              </div>
            </div>

            <aside className="reservation-identity-card">
              <p className="popover-kicker">Student</p>
              <dl>
                <div>
                  <dt>Full name</dt>
                  <dd>{selectedReservationInfo.student_name || "N/A"}</dd>
                </div>
              </dl>
            </aside>
          </div>

          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setSelectedReservationInfo(null);
              setSelectedSlotId(null);
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
