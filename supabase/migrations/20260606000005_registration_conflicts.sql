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
