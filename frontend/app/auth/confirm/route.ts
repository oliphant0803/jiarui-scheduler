/**
 * Email-link landing route. Supabase sends verification (signup) and password
 * recovery links here. Handles both Supabase email-link styles:
 *   - token_hash + type  (recommended templates) -> verifyOtp
 *   - code               (default PKCE flow)      -> exchangeCodeForSession
 *
 * On a recovery link we send the user to /reset-password; otherwise to `next`.
 */
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      const dest = type === "recovery" ? "/reset-password" : next;
      return NextResponse.redirect(new URL(dest, request.url));
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const dest = type === "recovery" ? "/reset-password" : next;
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth/auth-code-error", request.url));
}
