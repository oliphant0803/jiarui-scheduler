# Authentication

Registration, login, and password recovery — built together (PROJECT_SPEC §3).
Supabase Auth owns signup/login/email/reset; FastAPI verifies the Supabase JWT.

## JWT signing method (confirmed)

This project uses **asymmetric JWT signing keys**. The project's JWKS endpoint
serves an **ES256 / P-256** public key, so access tokens are verified against
that public key — *not* the legacy HS256 shared secret. The backend fetches and
caches the JWKS and verifies `aud=authenticated`, the issuer, and expiry. A
shared-secret (HS256) fallback is kept in code but unused for this project.

> How it was confirmed: `GET <SUPABASE_URL>/auth/v1/.well-known/jwks.json`
> returns `{"keys":[{"alg":"ES256","kty":"EC",...}]}`.

## Pieces

### Backend (`backend/app/`)
- `auth.py` — JWKS/ES256 verification + dependencies:
  - `get_current_user` — verify JWT, load profile, expose **identity + role**.
  - `require_active_user` — adds a **403** for deactivated or expired accounts (§3).
  - `require_admin` — adds a 403 for non-admins.
- `supabase_client.py` — service-role client (server-side only) for profile loads.
- `schemas.py` — `Profile`, `CurrentUser`.
- `main.py` — `GET /me` (requires active user), `GET /me/identity` (valid token).

### Frontend (`frontend/`)
- `lib/supabase/{client,server,middleware}.ts` — browser/server SSR clients +
  the session-refresh helper used by `proxy.ts` (Next 16's renamed middleware).
- `app/register` — email, legal full name, phone, WeChat, password. Pre-checks
  uniqueness via the `registration_conflicts` RPC for **specific** errors, then
  `supabase.auth.signUp(...)` (sends the verification email). Full name is not unique.
- `app/login` — email + password, **Remember me**, **Forgot password?** link.
- `app/forgot-password` — `resetPasswordForEmail(...)`.
- `app/reset-password` — sets a new password via `updateUser({ password })`.
- `app/auth/confirm/route.ts` — handles both email-link styles (`token_hash` +
  `verifyOtp`, and `code` + `exchangeCodeForSession`); recovery → `/reset-password`.

### Database (`supabase/migrations/`)
- The signup→profile trigger and uniqueness indexes live in `..._profiles.sql`.
- `..._registration_conflicts.sql` — `registration_conflicts(email, phone, wechat)`
  RPC so the (RLS-restricted) client can detect conflicts before signup.

## Required Supabase dashboard config

The code is done, but the email flows only **deliver** once the project is
configured (Dashboard → Authentication):

1. **URL Configuration**
   - **Site URL:** `http://localhost:3000` (use your real domain in prod).
   - **Redirect URLs:** add `http://localhost:3000/auth/confirm`
     (and the production equivalent).
2. **Email confirmations:** keep **ON** (already on — `mailer_autoconfirm=false`),
   so users must verify before login.
3. **Email templates (recommended).** The default templates work via the `code`
   flow. For the more robust cross-browser `token_hash` flow, set the Confirm
   signup and Reset password templates to link to:
   - signup:   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/login`
   - recovery: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   `app/auth/confirm/route.ts` handles either style.
4. **SMTP (prod):** Supabase's built-in email is rate-limited and for testing
   only. Configure a real SMTP provider before launch.

## Run it

```bash
# backend
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
# frontend
cd frontend && npm run dev
```

Calling the protected API from the frontend: attach the access token as a bearer
header, e.g. `Authorization: Bearer <session.access_token>` to `GET /me`.

## What has been verified

- **Backend (automated, against ES256 tokens):** valid token verifies and exposes
  sub/role; expired, forged-signature, and wrong-audience tokens are rejected
  (401); the access guard returns 403 for expired `access_expires_at` and for
  `is_active=false`; admins (null expiry) pass; `require_admin` blocks students.
- **DB:** all migrations apply; `registration_conflicts` returns correct flags
  (case-insensitive email).
- **Frontend:** production build passes; every auth page renders (HTTP 200).

## Still needs a live project (or local Supabase stack) to verify end-to-end

The real signup → verification email → login → reset round-trip needs a running
Supabase (the dashboard config above). Acceptance criteria to check there:
new student must verify email before login; duplicate phone/wechat rejected,
duplicate name allowed; "Forgot password?" sends a working reset; expired or
deactivated student is blocked from protected endpoints.
