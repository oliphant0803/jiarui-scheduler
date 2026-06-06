-- 20260606000003_time_slots.sql
-- time_slots table (PROJECT_SPEC §4, §9) + RLS.
--
-- Slot generation rules (for the weekly job, not enforced here):
--   Mon & Tue  TEF  18:30-20:30  -> 4 x 30min slots
--   Wed & Thu  TCF  18:00-21:00  -> 6 x 30min slots
--   Fri        TEF AND TCF  18:00-21:00 -> 6 slots; student picks the exam_type
--              when booking. Friday is the only day with both types at the same
--              start_time, which is why the UNIQUE below includes exam_type.

create table if not exists public.time_slots (
  id         uuid primary key default gen_random_uuid(),
  slot_date  date not null,
  start_time time not null,
  end_time   time not null,
  exam_type  public.exam_type not null,
  -- Monday of the target week this slot belongs to (for weekly cycling, §4).
  week_start date not null,
  created_at timestamptz not null default now(),
  -- One row per (day, start_time, exam_type). Friday can hold a TEF *and* a TCF
  -- row at the same start_time; all other days have a single exam_type per day.
  constraint time_slots_day_time_type_key unique (slot_date, start_time, exam_type)
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
