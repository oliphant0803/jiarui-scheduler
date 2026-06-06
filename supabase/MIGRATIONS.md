# Database Migrations & Admin Seed

SQL migrations and the admin bootstrap for the office-hour scheduler. The schema
implements PROJECT_SPEC §3 (students), §4 (slots), §5 (booking limits), §6
(reservations), §9 (data model), and §10 (security).

## Migration files (apply in order)

| Order | File | What it creates |
| ----- | ---- | --------------- |
| 1 | `migrations/20260606000001_init_extensions_and_enums.sql` | `pgcrypto`; enums `user_role`, `exam_type`, `reservation_topic`, `reservation_status` |
| 2 | `migrations/20260606000002_profiles.sql` | `profiles` table, unique indexes, `is_admin()`, signup→profile trigger, privileged-column guard, RLS |
| 3 | `migrations/20260606000003_time_slots.sql` | `time_slots` table + RLS |
| 4 | `migrations/20260606000004_reservations.sql` | `reservations` table, slot_date/created_at trigger, the two partial unique indexes, RLS |

Migrations are forward-only and idempotent (`if not exists`, `drop ... if exists`
before `create policy`, `create or replace`), so re-running the set is safe.

## How to apply

### Option A — Supabase CLI (recommended)

```bash
# from the repo root
supabase link --project-ref <your-project-ref>
supabase db push
```

### Option B — psql / SQL editor

Run each file **in numeric order** against your database:

```bash
for f in supabase/migrations/2026*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Or paste each file, in order, into the Supabase dashboard SQL editor.

> These migrations depend on Supabase-provided objects: the `auth.users` table
> and the `auth.uid()` / `auth.role()` helper functions. They are present in any
> Supabase project. (On vanilla PostgreSQL you'd need to stub them.)

## Schema notes & design decisions

- **Uniqueness (§3).** `email`, `phone`, `wechat` are unique (partial, `WHERE NOT
  NULL` so rows without a value don't collide); `full_name` is intentionally NOT
  unique. Duplicate phone/wechat/email at signup raise a unique violation the
  backend turns into a clear error.

- **Access window (§3).** The signup trigger sets `access_expires_at = now() + 1
  year` for students. Admins have `access_expires_at = NULL` (no expiry).

- **One reservation per slot & one per day (§5) are PARTIAL unique indexes on
  `status = 'active'`:**
  - `reservations_one_active_per_slot` — the FCFS / no-double-booking guarantee.
    Two concurrent inserts for the same slot → exactly one wins; the other gets a
    unique violation (no check-then-insert needed).
  - `reservations_one_active_per_student_per_day` — the always-on one-per-day cap.

  > **Why partial (active-only) and not a plain `UNIQUE` on `slot_id`?** A plain
  > unique would let a *cancelled* reservation permanently lock a slot and block
  > the student's day, which breaks cancellation/re-booking and the cancelled-row
  > history (§8). Active-only uniqueness keeps the hard invariant while preserving
  > history and allowing a freed slot to be re-booked. **Verified:** cancel →
  > re-book succeeds, cancelled row retained.

- **What the DB enforces vs. the app layer (§5).** The DB enforces one-active-per-
  slot and one-active-per-day. The Phase-1 "one total per week" cap and the
  booking windows (Mon-noon → Wed-noon, the gap, Thu-noon → Mon-noon) are
  evaluated in `America/Toronto` at the **application layer** — `slot_date` is a
  calendar date, timestamps are stored `timestamptz` (UTC).

- **Nothing trusted from the client (§6, §10).** On insert, a trigger sets
  `reservations.created_at = now()` (the FCFS tiebreaker) and copies `slot_date`
  from the referenced slot, overwriting anything the client sent. There is no
  free-text name/wechat on reservations — join to `profiles`.

- **Friday TEF+TCF.** `time_slots` is unique on `(slot_date, start_time,
  exam_type)`, so Friday can hold a TEF *and* a TCF row at the same start time;
  the student's choice of exam type is captured by *which* slot they book.

- **RLS (§7, §9, §10).** Students read/insert/update **only their own**
  reservations and read/update only their own profile; admins see and manage
  everything. `profiles` has **no INSERT policy** — rows are created solely by
  the `SECURITY DEFINER` signup trigger or the service role, so a client can
  never insert a profile and pick its own role. A guard trigger additionally
  rejects any attempt by a non-admin to change `role`, `is_active`,
  `access_expires_at`, `id`, or `created_at` on their own row.

## Admin seed

The single admin (PROJECT_SPEC §2) is created by a script that reads credentials
from `backend/.env` — **never hardcoded, never committed**.

### 1. Set the credentials in `backend/.env`

```dotenv
SUPABASE_URL=...                 # already set
SUPABASE_SERVICE_ROLE_KEY=...    # already set — service role, server-side only
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<a-strong-password>
```

### 2. Run the seed (after migrations are applied)

```bash
cd backend
source .venv/bin/activate          # if not already active
python scripts/seed_admin.py
```

What it does (idempotent — safe to re-run):
1. Creates the Supabase Auth user for `ADMIN_EMAIL` (email pre-confirmed). If the
   user already exists, it's reused.
2. Promotes that user's profile to `role='admin'`, `is_active=true`,
   `access_expires_at=NULL`.

> **Why the script and not a manual SQL `UPDATE`?** The privileged-column guard
> trigger only lets the **service role** (or an existing admin) change `role`. A
> plain `UPDATE profiles SET role='admin'` in the SQL editor runs as `postgres`
> with no JWT role and is **rejected by design**. The seed script connects with
> the service-role key, which the trigger exempts. To promote an admin manually
> you would have to go through the service role as well.

## Validation status

These migrations were applied in order against PostgreSQL 16 (with `auth.users`,
`auth.uid()`, `auth.role()` stubbed) and the following invariants were verified:
signup trigger creates a student profile with a 1-year window; duplicate
phone/wechat/email rejected while duplicate full_name allowed; Friday TEF+TCF at
the same start time both insert; `created_at`/`slot_date` are server-set on
insert (client values ignored); second active reservation on a slot rejected;
second active reservation on the same day for a student rejected; cancel →
re-book succeeds with the cancelled row retained; students see/modify only their
own rows and cannot escalate their role; admins see and override everything; the
service-role seed path promotes the admin successfully.
