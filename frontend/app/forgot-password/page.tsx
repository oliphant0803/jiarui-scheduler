"use client";

import Link from "next/link";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    // resetPasswordForEmail emails a recovery link that lands on /auth/confirm,
    // which forwards a verified recovery session to /reset-password.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setLoading(false);

    if (error) {
      setError("Something went wrong. Please try again.");
      return;
    }
    // Always show success (don't reveal whether the email exists).
    setSent(true);
  }

  if (sent) {
    return (
      <main className="auth-wrap">
        <div className="card">
          <div className="tricolore" style={{ marginBottom: "1.25rem", borderRadius: 2 }} />
          <h1 className="card-title">Check your email</h1>
          <p className="card-sub">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a
            link to reset your password.
          </p>
          <Link href="/login" className="btn btn-primary">
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-wrap">
      <form className="card" onSubmit={onSubmit} noValidate>
        <div className="tricolore" style={{ marginBottom: "1.25rem", borderRadius: 2 }} />
        <h1 className="card-title">Reset your password</h1>
        <p className="card-sub">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>

        <p className="foot-note">
          Remembered it? <Link href="/login" className="link">Back to login</Link>
        </p>
      </form>
    </main>
  );
}
