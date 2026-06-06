"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ActionKind = "generate" | "cleanup";

type GenerateWeek = {
  week_start: string;
  week_end: string;
  slots_count: number;
  exists: boolean;
};

type CleanupMonth = {
  month: string;
  slots_count: number;
};

type CleanupSlot = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  exam_type: string | null;
  week_start: string;
};

type PreviewState =
  | { type: "generate"; weeks: GenerateWeek[] }
  | { type: "cleanup"; cutoff: string; months: CleanupMonth[]; slots: CleanupSlot[]; slots_count: number };

type ActionResult = {
  ok: boolean;
  message: string;
};

export function AdminSlotTools() {
  const [loadingAction, setLoadingAction] = useState<ActionKind | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function getToken() {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function requestPreview(action: ActionKind) {
    setLoadingAction(action);
    setResult(null);

    const token = await getToken();
    if (!token) {
      setResult({ ok: false, message: "Please log in again before using admin tools." });
      setLoadingAction(null);
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}/admin/time-slots/${action}/preview`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setResult({ ok: false, message: data?.detail ?? "Could not load preview." });
        return;
      }

      if (action === "generate") {
        setPreview({ type: "generate", weeks: data.weeks ?? [] });
      } else {
        setPreview({
          type: "cleanup",
          cutoff: data.cutoff,
          months: data.months ?? [],
          slots: data.slots ?? [],
          slots_count: data.slots_count ?? 0,
        });
      }
    } catch {
      setResult({ ok: false, message: "Could not reach the backend admin API." });
    } finally {
      setLoadingAction(null);
    }
  }

  async function confirmAction(action: ActionKind) {
    setLoadingAction(action);
    setResult(null);

    const token = await getToken();
    if (!token) {
      setResult({ ok: false, message: "Please log in again before using admin tools." });
      setLoadingAction(null);
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}/admin/time-slots/${action}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setResult({ ok: false, message: data?.detail ?? "Admin action failed." });
        return;
      }

      setPreview(null);
      setResult(
        action === "generate"
          ? { ok: true, message: `Generated ${data.weeks_count} target weeks from the CSV schedule.` }
          : { ok: true, message: `Cleaned up ${data.deleted_count} past slot rows.` },
      );
    } catch {
      setResult({ ok: false, message: "Could not reach the backend admin API." });
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="admin-tool-grid">
      <section className="admin-tool-card">
        <p className="popover-kicker">CSV to Supabase</p>
        <h2>Generate next two months</h2>
        <p>
          Reads <strong>frontend/app/time-slots.csv</strong> and previews the weeks
          before creating missing slot rows.
        </p>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => requestPreview("generate")}
          disabled={loadingAction !== null}
        >
          {loadingAction === "generate" ? "Loading preview..." : "Preview generated slots"}
        </button>
      </section>

      <section className="admin-tool-card danger-zone">
        <p className="popover-kicker">Past months</p>
        <h2>Clean up old slots</h2>
        <p>
          Shows all slot rows before the current month, then lets you confirm deletion.
        </p>
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => requestPreview("cleanup")}
          disabled={loadingAction !== null}
        >
          {loadingAction === "cleanup" ? "Loading preview..." : "Show past slots"}
        </button>
      </section>

      {result && (
        <div className={`alert ${result.ok ? "alert-success" : "alert-error"} admin-result`}>
          {result.message}
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPreview(null)}>
          <div
            className="info-modal admin-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-preview-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="popover-kicker">
                  {preview.type === "generate" ? "Generation preview" : "Cleanup preview"}
                </p>
                <h2 id="admin-preview-title">
                  {preview.type === "generate" ? "Generated weeks" : "Past slots safe to erase"}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setPreview(null)}
                aria-label="Close"
              >
                x
              </button>
            </div>

            {preview.type === "generate" ? (
              <GeneratePreview weeks={preview.weeks} />
            ) : (
              <CleanupPreview preview={preview} />
            )}

            <div className="modal-actions admin-confirm-actions">
              <button
                type="button"
                className={preview.type === "generate" ? "btn btn-primary" : "btn btn-danger"}
                onClick={() => confirmAction(preview.type)}
                disabled={
                  loadingAction !== null ||
                  (preview.type === "generate" &&
                    !preview.weeks.some((week) => !week.exists))
                }
              >
                {loadingAction
                  ? "Working..."
                  : preview.type === "generate"
                    ? preview.weeks.some((week) => !week.exists)
                      ? "Confirm generation"
                      : "All weeks already exist"
                    : "Confirm cleanup"}
              </button>
              <button
                type="button"
                className="secondary-link modal-secondary"
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GeneratePreview({ weeks }: { weeks: GenerateWeek[] }) {
  if (!weeks.length) {
    return <p className="admin-empty-state">No target weeks found for the next two months.</p>;
  }

  const newCount = weeks.filter((week) => !week.exists).length;

  return (
    <>
      <p className="admin-preview-summary">
        {newCount > 0
          ? `${newCount} new week${newCount === 1 ? "" : "s"} to generate. Weeks already in the database are locked.`
          : "Every week in this range already exists in the database — nothing to generate."}
      </p>
      <ul className="admin-preview-list">
        {weeks.map((week) => (
          <li
            key={week.week_start}
            className={week.exists ? "preview-week-exists" : undefined}
            data-exists={week.exists || undefined}
            title={
              week.exists
                ? "These slots already exist in the database and cannot be regenerated."
                : undefined
            }
          >
            <span>
              Week of <strong>{week.week_start}</strong>
            </span>
            {week.exists ? (
              <span className="exists-badge">Already exists</span>
            ) : (
              <span>{week.slots_count} slots</span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function CleanupPreview({ preview }: { preview: Extract<PreviewState, { type: "cleanup" }> }) {
  if (!preview.slots_count) {
    return <p className="admin-empty-state">No past slots before {preview.cutoff}.</p>;
  }

  return (
    <>
      <div className="cleanup-summary">
        <strong>{preview.slots_count}</strong> slot rows before {preview.cutoff}
      </div>
      <ul className="admin-preview-list">
        {preview.months.map((month) => (
          <li key={month.month}>
            <span>
              Month <strong>{month.month}</strong>
            </span>
            <span>{month.slots_count} slots</span>
          </li>
        ))}
      </ul>
      <div className="cleanup-slot-table">
        {preview.slots.slice(0, 60).map((slot) => (
          <div key={slot.id}>
            <span>{slot.slot_date}</span>
            <span>
              {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)}
            </span>
            <span>{slot.exam_type ?? "FLEX"}</span>
          </div>
        ))}
      </div>
      {preview.slots.length > 60 && (
        <p className="admin-empty-state">Showing first 60 rows only.</p>
      )}
    </>
  );
}
