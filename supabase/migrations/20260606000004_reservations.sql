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
