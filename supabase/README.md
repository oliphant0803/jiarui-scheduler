# Supabase

This directory holds SQL migrations and Supabase configuration for the
office-hour scheduler.

## Layout

- `migrations/` — timestamped SQL migration files. Each migration is forward-only
  and should be safe to run in order on a fresh database.

## Conventions

- Name migrations `YYYYMMDDHHMMSS_short_description.sql`.
- Enable Row Level Security (RLS) on every user-facing table and add explicit
  policies — never rely on the anon key alone for access control.
- No schema is defined yet (scaffolding stage). Add migrations as features land.

## Applying migrations

Using the Supabase CLI (install separately):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
