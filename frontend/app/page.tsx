import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { full_name: string | null; role: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <main className="auth-wrap">
      <div className="card">
        <div className="tricolore" style={{ marginBottom: "1.5rem", borderRadius: 2 }} />
        <h1 className="card-title">
          <span className="brand">Online Study Room </span>Reservation
        </h1>

        {user ? (
          <>
            <p className="card-sub">
              Signed in as <strong>{profile?.full_name ?? user.email}</strong>
              {profile?.role ? ` · ${profile.role}` : ""}.
            </p>
            <p className="card-sub">
              Booking features are coming next. For now your account and session
              are set up.
            </p>
            <SignOutButton />
          </>
        ) : (
          <>
            <p className="card-sub">
              Book exam-prep (TEF / TCF). Please log in or create an
              account to continue.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Link href="/login" className="btn btn-primary">
                Log in
              </Link>
              <Link href="/register" className="link" style={{ textAlign: "center" }}>
                Create an account
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
