# Office Hour Scheduler

A web app for scheduling office hours. Monorepo containing the web frontend,
API backend, and database/auth configuration.

See [PROJECT_SPEC.md](./PROJECT_SPEC.md) for the full product requirements —
every development stage should read it for context.

## Stack

| Layer            | Technology                                          |
| ---------------- | --------------------------------------------------- |
| Frontend         | Next.js (App Router) + React + TypeScript           |
| Backend          | Python FastAPI                                      |
| Database / Auth  | Supabase (PostgreSQL + Supabase Auth)               |

## Repository layout

```
.
├── frontend/        # Next.js app (TypeScript, App Router)
├── backend/         # FastAPI app (Python venv + requirements.txt)
├── supabase/        # SQL migrations and Supabase config
├── PROJECT_SPEC.md  # Full product requirements (read this first)
└── README.md
```

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- A Supabase project (for real keys)

## Environment setup

Each app has a `.env.example` listing every variable it needs. Copy and fill in:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Real `.env` files are git-ignored — never commit secrets. The service-role key
and JWT secret belong in the backend only.

## Running the dev servers

### Backend (FastAPI) — http://localhost:8000

```bash
cd backend
source .venv/bin/activate          # the venv is committed-ignored; recreate with:
                                   # python3 -m venv .venv && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verify: `curl http://localhost:8000/health` → `{"status":"ok","timezone":"UTC"}`

Interactive API docs: http://localhost:8000/docs

### Frontend (Next.js) — http://localhost:3000

```bash
cd frontend
npm install        # first time only
npm run dev
```

## Status

Scaffolding only — no product features are implemented yet. The backend exposes
a single `/health` endpoint and the frontend is the default Next.js starter.
