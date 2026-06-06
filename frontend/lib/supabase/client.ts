/**
 * Browser-side Supabase client.
 *
 * Uses the public URL + anon key (both `NEXT_PUBLIC_*`). Row Level Security on
 * the database is what actually protects data — the anon key is safe to ship to
 * the browser. Never use the service-role key here.
 *
 * `remember` controls session persistence ("Remember me", PROJECT_SPEC §3):
 *   - true  -> auth cookies persist (~400 days)
 *   - false -> session cookies, cleared when the browser closes
 *   - undefined -> default persistent behavior
 */
import { createBrowserClient } from "@supabase/ssr";

import { REMEMBER_MAX_AGE } from "./constants";

export function createClient(remember?: boolean) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    remember === undefined
      ? undefined
      : { cookieOptions: remember ? { maxAge: REMEMBER_MAX_AGE } : {} },
  );
}
