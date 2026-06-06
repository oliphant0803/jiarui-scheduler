import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AdminAccountMenu } from "../../admin-account-menu";
import { AdminReservationCalendar } from "../admin-reservation-calendar";

export default async function ManageReservationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/reservation");
  }

  return (
    <main className="scheduler-page">
      <section className="scheduler-panel">
        <div className="scheduler-topbar">
          <div>
            <p className="eyebrow">Admin tools</p>
            <h1>Reservations calendar</h1>
            <p className="scheduler-sub">
              See who reserved each slot, and add, edit, or remove entries.
            </p>
          </div>
          <div className="topbar-actions">
            <Link href="/manage" className="secondary-link">
              ← Slot tools
            </Link>
            <AdminAccountMenu />
          </div>
        </div>

        <AdminReservationCalendar />
      </section>
    </main>
  );
}
