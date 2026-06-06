import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AccountUpdateForm } from "./account-update-form";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone, wechat")
    .eq("id", user.id)
    .single();

  return (
    <main className="scheduler-page">
      <section className="account-page-panel">
        <p className="eyebrow">Account details</p>
        <h1>Update reservation information</h1>
        <p className="scheduler-sub">
          These details are used on your reservations. Update them only if
          something is wrong.
        </p>
        <AccountUpdateForm
          userId={user.id}
          authEmail={user.email}
          profile={{
            full_name: profile?.full_name ?? null,
            email: profile?.email ?? user.email ?? null,
            phone: profile?.phone ?? null,
            wechat: profile?.wechat ?? null,
          }}
        />
      </section>
    </main>
  );
}
