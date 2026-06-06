import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AdminAccountMenu } from "../admin-account-menu";
import { AdminSlotTools } from "./admin-slot-tools";

export default async function ManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone, wechat, role")
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
            <h1>Manage time slots</h1>
            <p className="scheduler-sub">
              Generate slots from the CSV schedule and clean up fully past months.
            </p>
          </div>
          <div className="topbar-actions">
            <AdminAccountMenu />
          </div>
        </div>

        <AdminSlotTools />
      </section>
    </main>
  );
}
