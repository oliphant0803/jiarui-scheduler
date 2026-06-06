/**
 * Session-refresh helper run from the root middleware. Keeps the Supabase auth
 * cookies fresh on every request and honors the "Remember me" lifetime.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from "./constants";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const remember = request.cookies.get(REMEMBER_COOKIE)?.value === "1";
  const cookieOptions = remember ? { maxAge: REMEMBER_MAX_AGE } : {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Triggers a token refresh if needed and rewrites the cookies above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in? Don't show the auth forms again — otherwise a remembered
  // session looks "forgotten" because the user lands back on a blank login form.
  const path = request.nextUrl.pathname;
  if (user && (path === "/login" || path === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirect = NextResponse.redirect(url);
    // Carry over any auth cookies refreshed by getUser() above.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
