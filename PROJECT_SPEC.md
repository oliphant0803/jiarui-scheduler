# PROJECT_SPEC.md — Office-Hour Scheduler

This is the canonical specification for the project. Every build stage reads this file
for context. Keep it up to date; if behavior changes, change it here first.

---

## 0. Resolved decisions

These were previously open; they are now settled. Listed here so the rationale is on record.

1. **Timezone.** All day/time rules are evaluated in **`America/Toronto`** (Eastern Time).
   Every "12:00 PM" and weekday boundary is computed in this timezone, including DST
   transitions. Store timestamps as `timestamptz` (UTC) in the DB; convert to Eastern for
   all rule evaluation and display.

2. **Friday exam type.** Friday offers **both TEF and TCF**. Friday has **6 time slots**,
   and the student **selects TEF or TCF** for the slot they book. This is the ONLY day the
   student chooses the exam type; on all other days it is fixed by the day and shown
   read-only.

3. **Wednesday-noon → Thursday-noon gap.** Booking is **closed (view-only)** during this
   window. Slots are visible but cannot be reserved; the UI states when booking reopens.

---

## 1. Overview & stack

A weekly office-hour reservation system for exam prep (TEF / TCF).

- **Frontend:** Next.js (App Router) + React + TypeScript
- **Backend:** Python FastAPI
- **Database / Auth:** Supabase (PostgreSQL + Supabase Auth)
- **Auth model:** Supabase Auth owns signup, login, email verification, and password
  reset. FastAPI verifies the Supabase JWT on every request and enforces business rules.

---

## 2. User roles

Two roles only:

- **student** — registers, logs in, makes reservations.
- **admin** — manages reservations and users, views full history.

(No teacher role.)

### Admin account
Created via a secure seed/dashboard action that reads credentials from an untracked
`.env`. The admin email/password is NEVER hardcoded or committed to the repo.

---

## 3. Student accounts

### Registration — required fields
- Email
- Legal full name
- Phone number
- WeChat ID
- Password

### Uniqueness (anti–duplicate-account)
- **Unique:** email, phone, WeChat ID. Registration is rejected if any of these already
  exist.
- **NOT unique:** full name. Real people share names; blocking on name locks out
  legitimate users and doesn't stop abuse. Name is stored for display/admin review only.
- Note: uniqueness prevents casual duplicates but does not *verify* the data is real.
  Real phone/WeChat verification (SMS OTP etc.) is out of scope unless added later.

### Email verification
Handled by Supabase Auth. A student must verify their email before logging in.

### Password recovery (build this alongside registration & login — do not defer)
Forgotten passwords are handled entirely by **Supabase Auth's built-in email reset** —
there is no custom password storage and no "show me my password" feature (passwords are
only ever stored hashed and are unrecoverable by design). This is free with the stack and
is the cheap path, not the expensive one. Concretely, the auth surface has **three**
connected pieces that must be built together:

1. **Registration** — Supabase signup; sends the verification email. Student must verify
   before login. Enforce the uniqueness rules above and show clear errors on duplicate
   phone/WeChat/email.
2. **Login** — email + password. Include a visible **"Forgot password?"** link and an
   optional **"Remember me"** persistent session.
3. **Password reset** — "Forgot password?" calls `resetPasswordForEmail`, which emails the
   student a reset link, leading to a reset page where they set a new password. This is
   self-service; the admin's "remove user" is NOT the recovery mechanism (removing a user
   wipes history and resets their 1-year clock — see §3 Account removal).

Reminder for whoever builds the auth stage: registration, login, and reset are one
feature, not three. Ship the "Forgot password?" link in the same pass as the login form.

### Access duration
- Each student has **one year of access** from their signup date.
- Stored as `access_expires_at = signup time + 1 year`.
- After expiry, the student is blocked (clear 403) until reactivated.

### Account removal (admin)
- Default is **soft deactivate** (`is_active = false`) so reservation history is
  preserved.
- A separate hard-delete exists but requires explicit confirmation.
- Re-registration after removal **resets the 1-year access clock** (surface this in the
  admin UI).

---

## 4. Office-hour slots

### Slot definitions (each slot is 30 minutes)
- **Monday & Tuesday** — TEF only, 18:30–20:30 → **4 slots/day**
- **Wednesday & Thursday** — TCF only, 18:00–21:00 → **6 slots/day**
- **Friday** — both TEF and TCF, 18:00–21:00 → **6 slots/day**; the student selects TEF
  or TCF when booking (see §0.2 and §6)

Exam type is determined by the day (TEF Mon/Tue, TCF Wed/Thu) and is shown read-only to
the student — except Friday, where the student selects TEF or TCF (see §0.2).

### Weekly cycle
Reservations are always made for the **next** week (the upcoming Mon–Fri). The current
week is shown for display/context. Slots regenerate each week via a scheduled job.

---

## 5. Booking windows (two-phase) — CORE LOGIC

All times in `America/Toronto (Eastern Time)`. Worked example: target week = **Mon Jun 8 – Fri Jun 12**;
the booking week before it is **Jun 1 – Jun 5**.

### Phase 1 — single-pick (fair access)
- **When:** Monday 12:00 → Wednesday 12:00 of the week before the target week.
  (Example: Mon Jun 1 noon → Wed Jun 3 noon.)
- Target-week slots (Jun 8–12) are visible.
- Each student may reserve **exactly ONE slot total** for the entire target week.

### Gap
- Wednesday 12:00 → Thursday 12:00. **Booking closed / view-only** (see §0.3). Slots are
  visible but cannot be reserved.

### Phase 2 — one-per-day (open leftovers)
- **When:** Thursday 12:00 → the Saturday 12:00.
  (Example: Thu Jun 4 noon → Mon Jun 8 noon.)
- Target-week slots remain visible.
- The single-total cap is lifted. A student may now hold up to **one slot per day** for
  the target week (i.e. additional days beyond their Phase-1 pick).

### Combined limit rules (authoritative encoding)
- **Always:** at most **one reservation per day** per student within a target week.
- **During Phase 1 only:** additionally capped at **one reservation total** for the week.
- **During Phase 2:** the total cap is removed; only the one-per-day rule applies.
- **Rollover:** at each Monday 12:00, booking for the week that is starting closes, and
  Phase 1 opens for the following week.

---

## 6. Making a reservation

### What the client sends
ONLY: `slot_id`, `topic`, and (Friday only) `exam_type`. Nothing else is trusted from
the client.

### What the server resolves itself (never trusted from the request body)
- **Student full name and WeChat ID** — read from the authenticated user's profile.
- **Exam type** (non-Friday) — read from the slot/day.
- **Submission timestamp** (`created_at`) — set server-side; this is the
  First-Come-First-Serve tiebreaker.

### Topic (the one always-manual input)
Dropdown: **Listening / Speaking / Reading / Writing**.

### Identity guarantee
Because name/WeChat come from the JWT-authenticated profile, every reservation is
provably tied to a real registered account. There is no free-text name field. The
student sees their name/WeChat on the confirmation but can never edit them.

### Concurrency / FCFS
Double-booking is prevented at the **database level**: a UNIQUE constraint on the slot
plus row locking (`SELECT … FOR UPDATE`) or an insert relying on the unique index. Two
simultaneous requests for the same slot → exactly one succeeds; the other gets a clean
"slot already taken" error. No check-then-insert in application code.

---

## 7. Calendar display & privacy

- Weekly calendar view. Current week shown; next week's slots revealed per the booking
  windows in §5.
- **Privacy:** a slot booked by another student renders only as **"Taken"** (no name or
  details). The logged-in student sees full details for **their own** reservations only.
- **Admin** sees all reservations with full details (name, WeChat, topic, exam type,
  timestamp).
- When booking is closed (gap / outside windows), slots are view-only with a message
  stating when booking opens.

---

## 8. Admin features

- View all reservations with full detail and **submission timestamps**.
- Add / modify / delete any reservation (admin overrides booking windows and limits).
- Reservation **history**, including cancelled rows, ordered by `created_at`, for
  auditing FCFS disputes.
- User management: list users; **remove user** (soft deactivate by default, hard delete
  with explicit confirm).

---

## 9. Data model (summary)

**profiles** — `id` (uuid, FK auth.users), `role` (student|admin), `full_name`, `phone`,
`wechat`, `email`, `access_expires_at`, `is_active`, `created_at`. Unique on email,
phone, wechat.

**time_slots** — `id`, `slot_date`, `start_time`, `end_time`, `exam_type` (TEF|TCF),
`week_start`. Unique on (slot_date, start_time, exam_type).

**reservations** — `id`, `slot_id` (FK, unique), `student_id` (FK profiles), `topic`
(Listening|Speaking|Reading|Writing), `status` (active|cancelled), `created_at`
(server-set FCFS timestamp). No free-text name/wechat — join to profiles.

RLS: students read/insert only their own reservations; admin reads all.

---

## 10. Security ground rules

- Service-role / secret keys and any JWT-verification secrets live in the backend only,
  never in frontend code or `NEXT_PUBLIC_*` vars.
- No identity or role field is ever trusted from the client.
- Row Level Security is enabled on all user-data tables.
- Admin credentials are never committed.