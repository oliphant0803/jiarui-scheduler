"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  ExamType,
  Topic,
  dayLabel,
  examTypes,
  minutesToTime,
  currentWeekMondayKey,
  nextTargetWeekMondayKey,
  timeToMinutes,
  topics,
} from "../calendar-data";

type SlotRow = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  exam_type: ExamType | null;
  week_start: string;
};

type ProfileLite = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  wechat: string | null;
};

type Reservation = {
  id: string;
  slot_id: string;
  student_id: string;
  topic: Topic;
  exam_type: ExamType;
  status: "active" | "cancelled";
  slot_date: string;
  profiles: ProfileLite | null;
};

type Student = {
  id: string;
  full_name: string | null;
  wechat: string | null;
  email: string | null;
};

type PanelState =
  | { mode: "add"; slot: SlotRow }
  | { mode: "edit"; slot: SlotRow; reservation: Reservation };

function shiftKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function labelForKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return dayLabel(new Date(Date.UTC(y, m - 1, d, 12)));
}

function clock(value: string): string {
  return value.slice(0, 5);
}

function friendlyError(message: string): string {
  if (/one_active_per_slot/i.test(message)) return "This slot is already reserved.";
  if (/one_active_per_student_per_day/i.test(message))
    return "That student already has a reservation on this day.";
  if (/exam_type/i.test(message)) return "Please choose TEF or TCF for this Friday slot.";
  return message || "Something went wrong.";
}

export function AdminReservationCalendar() {
  // The week students are currently booking, anchored to the calendar "now"
  // (which honours NEXT_PUBLIC_TEST_NOW from .env), is the default. Admins can
  // navigate to other weeks; the data effect below refetches whenever it changes.
  const minMonday = useMemo(() => currentWeekMondayKey(), []);
  const maxMonday = useMemo(() => shiftKey(minMonday, 7), [minMonday]);
  const defaultMonday = useMemo(() => nextTargetWeekMondayKey(), []);
  const [weekMonday, setWeekMonday] = useState<string>(defaultMonday);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [panel, setPanel] = useState<PanelState | null>(null);

  const friday = useMemo(() => shiftKey(weekMonday, 4), [weekMonday]);
  // Loading is derived (no setState in the effect): the freshly-selected week
  // hasn't been loaded yet until the fetch below records it.
  const loading = loadedWeek !== weekMonday;

  const reload = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    // All setState happens after the first await, so the effect body never
    // updates state synchronously.
    (async () => {
      const supabase = createClient();
      const [slotRes, resvRes] = await Promise.all([
        supabase
          .from("time_slots")
          .select("id, slot_date, start_time, end_time, exam_type, week_start")
          .gte("slot_date", weekMonday)
          .lte("slot_date", friday)
          .order("slot_date")
          .order("start_time"),
        supabase
          .from("reservations")
          .select(
            "id, slot_id, student_id, topic, exam_type, status, slot_date, " +
              "profiles(full_name, email, phone, wechat)",
          )
          .gte("slot_date", weekMonday)
          .lte("slot_date", friday)
          .eq("status", "active"),
      ]);
      if (cancelled) return;

      if (slotRes.error || resvRes.error) {
        setError(
          slotRes.error?.message ?? resvRes.error?.message ?? "Could not load the calendar.",
        );
      } else {
        setSlots((slotRes.data ?? []) as SlotRow[]);
        setReservations((resvRes.data ?? []) as unknown as Reservation[]);
        setError(null);
      }
      setLoadedWeek(weekMonday);
    })();
    return () => {
      cancelled = true;
    };
  }, [weekMonday, friday, refreshKey]);

  // Students list is independent of the selected week — load once.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("id, full_name, wechat, email")
      .eq("role", "student")
      .order("full_name")
      .then(({ data }) => setStudents((data ?? []) as Student[]));
  }, []);

  const reservationBySlot = useMemo(() => {
    const map = new Map<string, Reservation>();
    for (const r of reservations) map.set(r.slot_id, r);
    return map;
  }, [reservations]);

  const days = useMemo(() => {
    const grouped = new Map<string, SlotRow[]>();
    for (const slot of slots) {
      grouped.set(slot.slot_date, [...(grouped.get(slot.slot_date) ?? []), slot]);
    }
    // Always render Mon–Fri columns so empty days still show.
    return [0, 1, 2, 3, 4].map((offset) => {
      const dayKey = shiftKey(weekMonday, offset);
      return { dayKey, label: labelForKey(dayKey), slots: grouped.get(dayKey) ?? [] };
    });
  }, [slots, weekMonday]);

  const timeRows = useMemo(() => {
    if (!slots.length) return [];
    const starts = slots.map((s) => timeToMinutes(clock(s.start_time)));
    const ends = slots.map((s) => timeToMinutes(clock(s.end_time)));
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    const rows: string[] = [];
    for (let cur = min; cur < max; cur += 30) rows.push(minutesToTime(cur));
    return rows;
  }, [slots]);

  const activeCount = reservations.length;
  const disablePrev = weekMonday <= minMonday;
  const disableNext = weekMonday >= maxMonday;

  const rangeLabel = `${labelForKey(weekMonday).replace(/^\w+,\s*/, "")} – ${labelForKey(friday).replace(/^\w+,\s*/, "")}`;

  return (
    <div className="admin-resv">
      <div className="admin-resv-bar">
        <div className="admin-resv-week">
          <p className="popover-kicker">
            {weekMonday === defaultMonday ? "Upcoming bookable week" : "Viewing week"}
          </p>
          <strong>{rangeLabel}</strong>
        </div>
        <nav className="week-nav" aria-label="Calendar week navigation">
          <button
            type="button"
            className="week-nav-btn"
            onClick={() => setWeekMonday((m) => (m <= minMonday ? minMonday : shiftKey(m, -7)))}
            disabled={disablePrev}
            aria-label="Previous week"
          >
            ← Prev
          </button>
          <button
            type="button"
            className="week-nav-btn"
            onClick={() => setWeekMonday((m) => (m >= maxMonday ? maxMonday : shiftKey(m, 7)))}
            disabled={disableNext}
            aria-label="Next week"
          >
            Next →
          </button>
          {weekMonday !== defaultMonday && (
            <button
              type="button"
              className="week-nav-reset"
              onClick={() => setWeekMonday(defaultMonday)}
            >
              Back to current bookable week
            </button>
          )}
        </nav>
        <span className="admin-resv-count">
          {activeCount} reservation{activeCount === 1 ? "" : "s"}
        </span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="admin-empty-state">Loading the week…</p>
      ) : !slots.length ? (
        <p className="admin-empty-state">
          No slots generated for this week. Use “Generate next two months” first, or pick another week.
        </p>
      ) : (
        <div className="calendar-shell">
          <aside className="time-rail" aria-hidden="true">
            <span />
            {timeRows.map((t) => (
              <span key={t}>{t}</span>
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
                  {timeRows.map((t) => {
                    const slot = day.slots.find((s) => clock(s.start_time) === t);
                    if (!slot) {
                      return <div className="calendar-empty-slot" key={`${day.dayKey}-${t}`} />;
                    }
                    const reservation = reservationBySlot.get(slot.id);
                    const label = slot.exam_type ?? "TEF / TCF";
                    return (
                      <button
                        type="button"
                        key={slot.id}
                        className={`calendar-slot admin-slot ${reservation ? "is-reserved" : ""}`}
                        data-exam={reservation ? reservation.exam_type : slot.exam_type ?? "FLEX"}
                        onClick={() =>
                          setPanel(
                            reservation
                              ? { mode: "edit", slot, reservation }
                              : { mode: "add", slot },
                          )
                        }
                      >
                        <span className="slot-time">
                          {clock(slot.start_time)}–{clock(slot.end_time)}
                        </span>
                        {reservation ? (
                          <>
                            <span className="slot-type admin-slot-name">
                              {reservation.profiles?.full_name || "Unknown student"}
                            </span>
                            <span className="slot-status">
                              {reservation.exam_type} · {reservation.topic}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="slot-type">{label}</span>
                            <span className="admin-slot-open">+ Add entry</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {panel && (
        <ReservationPanel
          key={`${panel.mode}-${panel.slot.id}`}
          panel={panel}
          students={students}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ReservationPanel({
  panel,
  students,
  onClose,
  onSaved,
}: {
  panel: PanelState;
  students: Student[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { slot } = panel;
  const flexible = slot.exam_type === null;
  const existing = panel.mode === "edit" ? panel.reservation : null;

  const [studentId, setStudentId] = useState<string>(existing?.student_id ?? "");
  const [topic, setTopic] = useState<Topic>(existing?.topic ?? "Speaking");
  const [examType, setExamType] = useState<ExamType>(existing?.exam_type ?? slot.exam_type ?? "TEF");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examValue = flexible ? examType : (slot.exam_type as ExamType);

  async function save() {
    setError(null);
    if (panel.mode === "add" && !studentId) {
      setError("Please choose a student.");
      return;
    }
    setBusy(true);
    const supabase = createClient();

    if (panel.mode === "add") {
      const { error: insertError } = await supabase.from("reservations").insert({
        slot_id: slot.id,
        student_id: studentId,
        topic,
        exam_type: examValue,
      });
      if (insertError) {
        setError(friendlyError(insertError.message));
        setBusy(false);
        return;
      }
    } else {
      const { error: updateError } = await supabase
        .from("reservations")
        .update({ topic, exam_type: examValue })
        .eq("id", existing!.id);
      if (updateError) {
        setError(friendlyError(updateError.message));
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    await onSaved();
  }

  async function remove() {
    if (!existing) return;
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("reservations")
      .delete()
      .eq("id", existing.id);
    if (deleteError) {
      setError(friendlyError(deleteError.message));
      setBusy(false);
      return;
    }
    setBusy(false);
    await onSaved();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="info-modal admin-resv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-resv-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="popover-kicker">
              {panel.mode === "add" ? "Add reservation" : "Edit reservation"}
            </p>
            <h2 id="admin-resv-title">
              {labelForKey(slot.slot_date)} · {clock(slot.start_time)}–{clock(slot.end_time)}
            </h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        {panel.mode === "edit" && existing && (
          <div className="admin-resv-identity">
            <p className="popover-kicker">Reserved by</p>
            <dl>
              <div>
                <dt>Name</dt>
                <dd>{existing.profiles?.full_name || "—"}</dd>
              </div>
              <div>
                <dt>WeChat</dt>
                <dd>{existing.profiles?.wechat || "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{existing.profiles?.email || "—"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{existing.profiles?.phone || "—"}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="admin-resv-fields">
          {panel.mode === "add" && (
            <label className="field compact-field">
              <span className="label">Student</span>
              <select
                className="input"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || "(no name)"}
                    {s.wechat ? ` · ${s.wechat}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field compact-field">
            <span className="label">Topic</span>
            <select className="input" value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="field compact-field">
            <span className="label">Course</span>
            <select
              className="input"
              value={examValue}
              onChange={(e) => setExamType(e.target.value as ExamType)}
              disabled={!flexible}
            >
              {(flexible ? examTypes : [slot.exam_type as ExamType]).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="alert alert-error compact-alert">{error}</div>}

        <div className="modal-actions admin-resv-actions">
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : panel.mode === "add" ? "Add reservation" : "Save changes"}
          </button>
          {panel.mode === "edit" && (
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
              Delete
            </button>
          )}
          <button type="button" className="secondary-link modal-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
