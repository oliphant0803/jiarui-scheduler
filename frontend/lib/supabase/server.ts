/**
 * Server-side Supabase client (RSC, Route Handlers, Server Actions).
 *
 * Reads/writes the session from Next.js cookies so the server and browser share
 * one session. Still the anon key — RLS applies. `cookies()` is async in Next 16.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In a pure RSC render cookies can't be set; the middleware refreshes
          // the session, so this try/catch is the documented no-op fallback.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* called from a Server Component — safe to ignore */
          }
        },
      },
    },
  );
}
