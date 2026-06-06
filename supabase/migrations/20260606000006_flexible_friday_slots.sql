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
