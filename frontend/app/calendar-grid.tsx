"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  CalendarSlot,
  ExamType,
  Topic,
  dayLabel,
  examTypes,
  getBookingPhase,
  getCalendarNow,
  minutesToTime,
  topics,
  timeToMinutes,
} from "./calendar-data";

type Props = {
  slots: CalendarSlot[];
  editable: boolean;
  studentIdentity?: {
    fullName: string | null;
    wechat: string | null;
  };
};

export function CalendarGrid({ slots, editable, studentIdentity }: Props) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [topic, setTopic] = useState<Topic>("Speaking");
  const [examType, setExamType] = useState<ExamType>("TEF");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const phase = getBookingPhase(getCalendarNow());
  const canBook = editable && (phase === "phase1" || phase === "phase2");
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null;
  const hasReservationIdentity = Boolean(studentIdentity?.fullName && studentIdentity?.wechat);

  function selectSlot(slotId: string) {
    setSelectedSlotId(slotId);
    setIdentityConfirmed(false);
    setSubmitError(null);
    setSubmitMessage(null);
  }

  useEffect(() => {
    if (!selectedSlot) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setSelectedSlotId(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedSlot]);

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
                const label = slot.flexible ? "TEF / TCF" : slot.examType;
                return (
                  <button
                    type="button"
                    key={slot.id}
                    className={`calendar-slot ${isSelected ? "is-selected" : ""}`}
                    data-exam={slot.examType ?? "FLEX"}
                    onClick={() => canBook && selectSlot(slot.id)}
                    disabled={!canBook}
                  >
                    <span className="slot-time">
                      {slot.start} - {slot.end}
                    </span>
                    <span className="slot-type">{label}</span>
                    <span className="slot-status">
                      {editable ? (canBook ? "Select time" : "View only") : "Open"}
                    </span>
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
          <button
            className="btn btn-primary"
            type="button"
            onClick={reserveSelectedSlot}
            disabled={submitting || !identityConfirmed || !hasReservationIdentity}
          >
            {submitting ? "Reserving..." : "Reserve this slot"}
          </button>
        </div>
      )}
    </div>
  );
}
