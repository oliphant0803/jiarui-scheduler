-- Auto-generated: all migrations concatenated in order.
-- Paste into Supabase Dashboard > SQL Editor and Run. Idempotent.

-- ============================================================
-- supabase/migrations/20260606000001_init_extensions_and_enums.sql
-- ============================================================
-- 20260606000001_init_extensions_and_enums.sql
-- Foundational extensions and enum types for the office-hour scheduler.
-- Safe to run once on a fresh Supabase/PostgreSQL database. Forward-only.

-- gen_random_uuid() — core in PG13+, but ensure pgcrypto for older targets.
create extension if not exists pgcrypto;

-- Roles: only student and admin (PROJECT_SPEC §2). No teacher role.
do $$ begin
  create type public.user_role as enum ('student', 'admin');
exception when duplicate_object then null; end $$;

-- Exam type for slots (PROJECT_SPEC §4).
do $$ begin
  create type public.exam_type as enum ('TEF', 'TCF');
exception when duplicate_object then null; end $$;

-- Reservation topic — the one always-manual student input (PROJECT_SPEC §6).
do $$ begin
  create type public.reservation_topic as enum ('Listening', 'Speaking', 'Reading', 'Writing');
exception when duplicate_object then null; end $$;

-- Reservation lifecycle. Cancelled rows are retained for FCFS audit (PROJECT_SPEC §8).
do $$ begin
  create type public.reservation_status as enum ('active', 'cancelled');
exception when duplicate_object then null; end $$;

-- ============================================================
-- supabase/migrations/20260606000002_profiles.sql
-- ============================================================
-- 20260606000002_profiles.sql
-- profiles table (PROJECT_SPEC §3, §9), the admin-detection helper, the
-- signup -> profile trigger, privileged-column protection, and RLS policies.

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  role              public.user_role not null default 'student',
  full_name         text,
  phone             text,
  wechat            text,
  email             text,
  -- signup time + 1 year for students; NULL = no expiry (admins).
  access_expires_at timestamptz,
  -- admin soft-deactivate; false blocks access while preserving history.
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Uniqueness (PROJECT_SPEC §3): email, phone, wechat are unique; full_name is NOT.
-- Partial (WHERE NOT NULL) so admins/rows without a value don't collide on NULL.
create unique index if not exists profiles_email_key  on public.profiles (email)  where email  is not null;
create unique index if not exists profiles_phone_key  on public.profiles (phone)  where phone  is not null;
create unique index if not exists profiles_wechat_key on public.profiles (wechat) where wechat is not null;

-- ---------------------------------------------------------------------------
-- Admin detection. SECURITY DEFINER so it bypasses RLS on profiles (avoids the
-- policy-on-profiles-querying-profiles recursion). STABLE: same within a stmt.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin' and p.is_active
  );
$$;

-- ---------------------------------------------------------------------------
-- Auto-create a student profile when a Supabase Auth user is created.
-- Registration metadata (full_name/phone/wechat) is passed at signup; the
-- UNIQUE indexes above reject duplicate phone/wechat/email (PROJECT_SPEC §3).
-- access_expires_at is set server-side to now() + 1 year — never trusted from
-- the client (PROJECT_SPEC §10).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, wechat, role, access_expires_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'wechat',
    'student',
    now() + interval '1 year'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Protect privileged columns: a student must never escalate their own role,
-- flip is_active, or extend access_expires_at (PROJECT_SPEC §10 — role/identity
-- never trusted from the client). Admins and the service role may change them.
-- auth.role() = 'service_role' covers backend/seed jobs (which have no uid).
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  if new.id                is distinct from old.id
     or new.role              is distinct from old.role
     or new.is_active         is distinct from old.is_active
     or new.access_expires_at is distinct from old.access_expires_at
     or new.created_at        is distinct from old.created_at then
    raise exception 'not authorized to modify privileged profile fields';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- Row Level Security (PROJECT_SPEC §9, §10).
-- No INSERT policy: rows are created only by handle_new_user (SECURITY DEFINER)
-- or the service role — clients cannot insert a profile (and thus cannot pick a
-- role). Students may read/update only their own row; admins read/update all.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin  on public.profiles;
drop policy if exists profiles_update_own    on public.profiles;
drop policy if exists profiles_update_admin  on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- supabase/migrations/20260606000003_time_slots.sql
-- ============================================================
-- 20260606000003_time_slots.sql
-- time_slots table (PROJECT_SPEC §4, §9) + RLS.
--
-- Slot generation rules (for the weekly job, not enforced here):
--   Mon & Tue  TEF  18:30-20:30  -> 4 x 30min slots
--   Wed & Thu  TCF  18:00-21:00  -> 6 x 30min slots
--   Fri        exam_type NULL  18:00-21:00 -> 6 x 30min slots; student picks
--              TEF or TCF when booking. The chosen type is stored on the
--              reservation, not fixed on the generated slot.

create table if not exists public.time_slots (
  id         uuid primary key default gen_random_uuid(),
  slot_date  date not null,
  start_time time not null,
  end_time   time not null,
  -- NULL only for Friday flexible slots (PROJECT_SPEC §0.2 / §6).
  exam_type  public.exam_type,
  -- Monday of the target week this slot belongs to (for weekly cycling, §4).
  week_start date not null,
  created_at timestamptz not null default now(),
  -- One generated slot per day/start. Friday's exam choice is made later on
  -- reservations, so re-running the generator no-ops on this key.
  constraint time_slots_day_time_key unique (slot_date, start_time)
);

create index if not exists time_slots_week_start_idx on public.time_slots (week_start);
create index if not exists time_slots_slot_date_idx  on public.time_slots (slot_date);

-- ---------------------------------------------------------------------------
-- RLS: any authenticated user may view slots (calendar, PROJECT_SPEC §7).
-- Only admins may write via the API; the weekly generator job uses the service
-- role, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.time_slots enable row level security;

drop policy if exists time_slots_select_authenticated on public.time_slots;
drop policy if exists time_slots_admin_write          on public.time_slots;

create policy time_slots_select_authenticated on public.time_slots
  for select to authenticated using (true);

create policy time_slots_admin_write on public.time_slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- supabase/migrations/20260606000004_reservations.sql
-- ============================================================
-- 20260606000004_reservations.sql
-- reservations table (PROJECT_SPEC §6, §9) with DB-enforced FCFS / one-per-slot
-- and one-per-day invariants, plus RLS.

create table if not exists public.reservations (
  id         uuid primary key default gen_random_uuid(),
  slot_id    uuid not null references public.time_slots (id) on delete cascade,
  student_id uuid not null references public.profiles (id)   on delete cascade,
  topic      public.reservation_topic   not null,
  -- Resolved server-side from time_slots.exam_type for Mon-Thu; required from
  -- the student only for Friday flexible slots (PROJECT_SPEC §0.2 / §6).
  exam_type  public.exam_type           not null,
  status     public.reservation_status  not null default 'active',
  -- Denormalized from time_slots.slot_date so the one-per-day partial unique
  -- index below can be expressed on this table. Maintained by a trigger; never
  -- trusted from the client. (slot_date is a calendar date; day/phase logic is
  -- still evaluated in America/Toronto at the app layer — PROJECT_SPEC §5.)
  slot_date  date not null,
  -- Server-set; the First-Come-First-Serve tiebreaker (PROJECT_SPEC §6).
  created_at timestamptz not null default now()
);

create index if not exists reservations_student_idx on public.reservations (student_id);
create index if not exists reservations_slot_idx    on public.reservations (slot_id);

-- ---------------------------------------------------------------------------
-- Keep slot_date in sync with the referenced slot, reject bad slot_ids, and
-- stamp the FCFS created_at server-side on INSERT so it is never trusted from
-- the client (PROJECT_SPEC §6 — neither slot_date nor created_at are trusted).
-- SECURITY DEFINER so it can always read time_slots regardless of caller RLS.
-- ---------------------------------------------------------------------------
create or replace function public.set_reservation_slot_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select ts.slot_date, coalesce(ts.exam_type, new.exam_type)
    into new.slot_date, new.exam_type
  from public.time_slots ts
  where ts.id = new.slot_id;

  if new.slot_date is null then
    raise exception 'invalid slot_id: %', new.slot_id;
  end if;

  if new.exam_type is null then
    raise exception 'exam_type is required for flexible Friday slots';
  end if;

  -- FCFS tiebreaker is set by the server, ignoring any client-supplied value.
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_set_slot_fields on public.reservations;
drop trigger if exists reservations_set_slot_date on public.reservations;
create trigger reservations_set_slot_fields
  before insert or update of slot_id, exam_type on public.reservations
  for each row execute function public.set_reservation_slot_date();

-- ---------------------------------------------------------------------------
-- DB-enforced invariants (PROJECT_SPEC §5, §6). Both are PARTIAL on
-- status='active' so a cancelled reservation neither locks the slot forever nor
-- blocks the student's day — cancelled rows remain for FCFS audit (§8), and a
-- freed slot can be re-booked.
--
--   * One ACTIVE reservation per slot  -> double-booking is impossible; two
--     concurrent inserts for the same slot -> exactly one wins, the other gets
--     a unique-violation (no check-then-insert in app code — §6).
--   * One ACTIVE reservation per student per day -> the always-on one-per-day
--     cap. The Phase-1 "one total per week" cap and booking windows are
--     enforced at the app layer in America/Toronto (§5).
-- ---------------------------------------------------------------------------
create unique index if not exists reservations_one_active_per_slot
  on public.reservations (slot_id) where status = 'active';

create unique index if not exists reservations_one_active_per_student_per_day
  on public.reservations (student_id, slot_date) where status = 'active';

-- ---------------------------------------------------------------------------
-- RLS (PROJECT_SPEC §7, §9, §10).
-- Students read/insert/update only their own rows (student_id = auth.uid()),
-- so a student can never see another student's details (renders as "Taken" in
-- the UI) nor write on someone else's behalf. Admins do everything.
-- ---------------------------------------------------------------------------
alter table public.reservations enable row level security;

drop policy if exists reservations_select_own   on public.reservations;
drop policy if exists reservations_select_admin  on public.reservations;
drop policy if exists reservations_insert_own    on public.reservations;
drop policy if exists reservations_update_own    on public.reservations;
drop policy if exists reservations_admin_all     on public.reservations;

create policy reservations_select_own on public.reservations
  for select to authenticated using (student_id = auth.uid());

create policy reservations_select_admin on public.reservations
  for select to authenticated using (public.is_admin());

create policy reservations_insert_own on public.reservations
  for insert to authenticated with check (student_id = auth.uid());

create policy reservations_update_own on public.reservations
  for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy reservations_admin_all on public.reservations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- supabase/migrations/20260606000005_registration_conflicts.sql
-- ============================================================
-- 20260606000005_registration_conflicts.sql
-- Pre-signup uniqueness check so the registration form can show SPECIFIC errors
-- (PROJECT_SPEC §3: clear errors when email/phone/wechat already exist).
--
-- Why an RPC: RLS lets a student read only their own profile, so the client
-- cannot query other rows to detect a conflict. This SECURITY DEFINER function
-- checks the three unique fields and returns only booleans (no data leaked).
-- The UNIQUE indexes on profiles remain the authoritative backstop against the
-- (rare) race between this check and the actual signup.
--
-- Note: like any "is this taken?" signup check, this reveals existence of a
-- given email/phone/wechat — inherent to giving specific registration errors.

create or replace function public.registration_conflicts(
  p_email  text default null,
  p_phone  text default null,
  p_wechat text default null
)
returns table (email_taken boolean, phone_taken boolean, wechat_taken boolean)
language sql
security definer
set search_path = public
stable
as $$
  select
    (p_email  is not null and exists (select 1 from public.profiles where lower(email) = lower(p_email))) as email_taken,
    (p_phone  is not null and exists (select 1 from public.profiles where phone  = p_phone))             as phone_taken,
    (p_wechat is not null and exists (select 1 from public.profiles where wechat = p_wechat))            as wechat_taken;
$$;

-- Callable by both anon (pre-login registration form) and authenticated users.
grant execute on function public.registration_conflicts(text, text, text) to anon, authenticated;

-- ============================================================
-- supabase/migrations/20260606000006_flexible_friday_slots.sql
-- ============================================================
-- 20260606000006_flexible_friday_slots.sql
-- Bring an existing database forward to the resolved Friday model:
-- one generated Friday slot row with time_slots.exam_type = NULL, while the
-- student's chosen Friday exam_type is stored on reservations.

-- 1. Friday flexible slots need NULL exam_type.
alter table public.time_slots
  alter column exam_type drop not null;

-- 2. Existing databases may still have the old per-exam unique constraint.
alter table public.time_slots
  drop constraint if exists time_slots_day_time_type_key;

-- 3. Add reservation exam_type if this database was created before that change.
alter table public.reservations
  add column if not exists exam_type public.exam_type;

-- Backfill existing reservations from their slot. This preserves old rows
-- before the NOT NULL is enforced.
update public.reservations r
set exam_type = ts.exam_type
from public.time_slots ts
where r.slot_id = ts.id
  and r.exam_type is null
  and ts.exam_type is not null;

-- Existing flexible Friday reservations, if any, cannot be inferred. They must
-- be reviewed manually before enforcing NOT NULL.
do $$
begin
  if exists (select 1 from public.reservations where exam_type is null) then
    raise exception 'Cannot enforce reservations.exam_type: existing rows need manual Friday exam_type backfill';
  end if;
end $$;

alter table public.reservations
  alter column exam_type set not null;

-- 4. If old Friday TEF/TCF duplicate slot rows exist and are unreserved, keep one
-- row and convert it to flexible. Stop if both duplicate rows are referenced by
-- active/cancelled reservation history, because automatic merging would break
-- foreign keys and audit history.
do $$
declare
  duplicate_count int;
begin
  select count(*) into duplicate_count
  from (
    select slot_date, start_time
    from public.time_slots
    group by slot_date, start_time
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 and exists (
    select 1
    from public.time_slots a
    join public.time_slots b
      on a.slot_date = b.slot_date
     and a.start_time = b.start_time
     and a.id <> b.id
    join public.reservations ra on ra.slot_id = a.id
    join public.reservations rb on rb.slot_id = b.id
  ) then
    raise exception 'Cannot merge duplicate Friday slots automatically: duplicate rows have reservation history';
  end if;
end $$;

with ranked_slots as (
  select
    ts.id,
    row_number() over (
      partition by ts.slot_date, ts.start_time
      order by
        exists (select 1 from public.reservations r where r.slot_id = ts.id) desc,
        ts.id
    ) as keep_rank
  from public.time_slots ts
)
delete from public.time_slots doomed
using ranked_slots ranked
where doomed.id = ranked.id
  and ranked.keep_rank > 1
  and not exists (
    select 1 from public.reservations r where r.slot_id = doomed.id
  );

update public.time_slots
set exam_type = null
where extract(isodow from slot_date) = 5;

-- 5. New idempotency key used by the CSV generator.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'time_slots_day_time_key'
      and conrelid = 'public.time_slots'::regclass
  ) then
    alter table public.time_slots
      add constraint time_slots_day_time_key unique (slot_date, start_time);
  end if;
end $$;
