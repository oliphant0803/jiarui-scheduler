import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "../account-menu";
import { CalendarGrid } from "../calendar-grid";
import { loadCalendarSlots } from "../calendar-schedule";
import {
  currentTorontoLabel,
  getBookingPhase,
  getCalendarNow,
  weekRangeLabel,
} from "../calendar-data";
import { TalkingBrandHeader } from "../talking-brand-header";

export default async function ReservationPage() {
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

  if (profile?.role === "admin") {
    redirect("/manage");
  }

  const now = getCalendarNow();
  const slots = await loadCalendarSlots(now);
  const phase = getBookingPhase(now);

  return (
    <main className="scheduler-page">
      <section className="scheduler-panel">
        <TalkingBrandHeader phase={phase} loggedIn />
        <div className="scheduler-topbar">
          <div>
            <p className="eyebrow">Toronto time · {currentTorontoLabel(now)}</p>
            <h1>Reserve next week</h1>
            <p className="scheduler-sub">{weekRangeLabel(slots)} · 30-minute office hours</p>
          </div>
          <div className="topbar-actions">
            <AccountMenu
              fallbackEmail={user.email}
              profile={{
                full_name: profile?.full_name ?? null,
                email: profile?.email ?? user.email ?? null,
                phone: profile?.phone ?? null,
                wechat: profile?.wechat ?? null,
              }}
            />
          </div>
        </div>

        <CalendarGrid
          slots={slots}
          editable
          studentIdentity={{
            fullName: profile?.full_name ?? null,
            wechat: profile?.wechat ?? null,
          }}
        />
      </section>
    </main>
  );
}
