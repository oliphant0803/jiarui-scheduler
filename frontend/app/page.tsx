import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BrandHeader } from "./brand-header";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    redirect(profile?.role === "admin" ? "/manage" : "/reservation");
  }

  return (
    <main className="auth-wrap">
      <div className="card">
        <BrandHeader />
        <h1 className="card-title">
          <span className="brand">Online Study Platform </span>
        </h1>

        <p className="card-sub">
          Book TEF / TCF office-hour slots for next week. The owl keeps the
          rules short; you choose the time first.
        </p>
        <div className="home-actions">
          <Link href="/login" className="btn btn-primary">
            Log in
          </Link>
          <Link href="/register" className="link">
            Create an account
          </Link>
          <Link href="/calender-view" className="link">
            View next week calendar
          </Link>
        </div>
      </div>
    </main>
  );
}
