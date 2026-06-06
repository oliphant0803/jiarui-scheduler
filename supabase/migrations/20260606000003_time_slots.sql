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
