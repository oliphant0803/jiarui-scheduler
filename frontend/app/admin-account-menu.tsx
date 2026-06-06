"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function AdminAccountMenu() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="account-menu admin-account-menu">
      <div className="account-mini">
        <span>Logged in as:</span>
        <strong>Admin</strong>
      </div>
      <button
        type="button"
        className="btn btn-primary account-button"
        onClick={signOut}
        disabled={loading}
      >
        {loading ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
