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
