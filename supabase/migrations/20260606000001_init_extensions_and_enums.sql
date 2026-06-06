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
