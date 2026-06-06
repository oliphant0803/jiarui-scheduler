"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export type AccountProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  wechat: string | null;
};

type Props = {
  profile: AccountProfile;
  fallbackEmail?: string | null;
};

export function AccountMenu({ profile, fallbackEmail }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const displayName = profile.full_name || fallbackEmail || "Student";

  async function signOut() {
    setLoading(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="account-menu">
      <div className="account-mini">
        <span>Logged in as:</span>
        <strong>{displayName}</strong>
      </div>
      <div className="account-actions">
        <button
          type="button"
          className="account-button account-info-trigger"
          onClick={() => setOpen(true)}
        >
          View full information
        </button>
        <button
          type="button"
          className="btn btn-primary account-button"
          onClick={signOut}
          disabled={loading}
        >
          {loading ? "Signing out..." : "Sign out"}
        </button>
      </div>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-info-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="popover-kicker">Reservation identity</p>
                <h2 id="reservation-info-title">Information that will be reserved</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                x
              </button>
            </div>

            <dl className="info-list">
              <div>
                <dt>WeChat ID</dt>
                <dd>{profile.wechat || "Not provided"}</dd>
              </div>
              <div>
                <dt>Full name</dt>
                <dd>{profile.full_name || "Not provided"}</dd>
              </div>
              <div>
                <dt>Email address</dt>
                <dd>{profile.email || fallbackEmail || "Not provided"}</dd>
              </div>
            </dl>

            <div className="modal-actions">
              <span className="wrong-info-note">Something is wrong?</span>
              <Link href="/account" className="btn btn-primary">
                Update information
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
