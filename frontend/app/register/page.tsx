"use client";

import Link from "next/link";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { BrandHeader } from "../brand-header";
import { EyeIcon, EyeOffIcon } from "../eye-icons";

type FieldErrors = Partial<
  Record<"email" | "fullName" | "phone" | "wechat" | "password" | "confirm", string>
>;

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    phone: "",
    wechat: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!form.email.trim()) e.email = "Email is required.";
    if (!form.fullName.trim()) e.fullName = "Legal full name is required.";
    if (!form.phone.trim()) e.phone = "Phone number is required.";
    if (!form.wechat.trim()) e.wechat = "WeChat ID is required.";
    if (form.password.length < 8)
      e.password = "Password must be at least 8 characters.";
    if (form.confirm !== form.password)
      e.confirm = "Passwords do not match.";
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setGeneralError(null);
    const v = validate();
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }
    setErrors({});
    setLoading(true);

    const supabase = createClient();

    try {
      // 1. Specific uniqueness errors BEFORE signup (PROJECT_SPEC §3). The DB
      //    unique indexes remain the authoritative backstop.
      const { data: conflicts, error: rpcError } = await supabase.rpc(
        "registration_conflicts",
        {
          p_email: form.email.trim(),
          p_phone: form.phone.trim(),
          p_wechat: form.wechat.trim(),
        },
      );

      if (rpcError) {
        setGeneralError("Could not validate your details. Please try again.");
        return;
      }

      const c = Array.isArray(conflicts) ? conflicts[0] : conflicts;
      if (c && (c.email_taken || c.phone_taken || c.wechat_taken)) {
        setErrors({
          email: c.email_taken ? "This email is already registered." : undefined,
          phone: c.phone_taken ? "This phone number is already in use." : undefined,
          wechat: c.wechat_taken ? "This WeChat ID is already in use." : undefined,
        });
        return;
      }

      // 2. Supabase signup — sends the verification email; the DB trigger
      //    creates the profile from this metadata. Full name is NOT unique.
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            full_name: form.fullName.trim(),
            phone: form.phone.trim(),
            wechat: form.wechat.trim(),
          },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/login`,
        },
      });

      if (error) {
        // Most likely a race that hit a unique index, or a weak password.
        setGeneralError(error.message);
        return;
      }

      // Supabase obfuscates "email already registered" as a success with no
      // identities — surface a clear message.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setErrors({ email: "This email is already registered." });
        return;
      }

      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="auth-wrap">
        <div className="card">
          <BrandHeader />
          <h1 className="card-title">Vérifiez votre email</h1>
          <p className="card-sub">
            We sent a verification link to <strong>{form.email}</strong>. Click it
            to confirm your account — you must verify before you can log in.
          </p>
          <Link href="/login" className="btn btn-primary">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-wrap">
      <form className="card" onSubmit={onSubmit} noValidate>
        <BrandHeader />
        <h1 className="card-title">Create your account</h1>
        <p className="card-sub">Register to reserve exam-prep office hours.</p>

        <div className="owl-note" role="note">
          <span className="owl-note-avatar" aria-hidden="true">
            🦉
          </span>
          <p className="owl-note-bubble">
            <strong>Hoot! A wise word before you fly off —</strong> your{" "}
            <strong>full name</strong>, <strong>email</strong>, and{" "}
            <strong>WeChat ID</strong> are the three keys I use to match you to
            your reservations. Enter them carefully and exactly as you&apos;ll
            use them; a typo here can leave a booking with no owl to deliver it
            to. 🌿
          </p>
        </div>

        {generalError && <div className="alert alert-error">{generalError}</div>}

        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={update("email")}
          error={errors.email}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <Field
          label="Legal full name"
          value={form.fullName}
          onChange={update("fullName")}
          error={errors.fullName}
          placeholder="As on your ID"
          autoComplete="name"
        />
        <Field
          label="Phone number"
          value={form.phone}
          onChange={update("phone")}
          error={errors.phone}
          placeholder="+1 416 555 0123"
          autoComplete="tel"
        />
        <Field
          label="WeChat ID"
          value={form.wechat}
          onChange={update("wechat")}
          error={errors.wechat}
          placeholder="your_wechat_id"
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={update("password")}
          error={errors.password}
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />
        <Field
          label="Confirm password"
          type="password"
          value={form.confirm}
          onChange={update("confirm")}
          error={errors.confirm}
          placeholder="Re-enter your password"
          autoComplete="new-password"
        />

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="foot-note">
          Already have an account? <Link href="/login" className="link">Log in</Link>
        </p>
      </form>
    </main>
  );
}

function Field({
  label,
  error,
  type,
  ...props
}: {
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && reveal ? "text" : type;

  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className={isPassword ? "input-reveal" : undefined}>
        <input
          className="input"
          type={inputType}
          aria-invalid={error ? "true" : undefined}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="reveal-btn"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
          >
            {reveal ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
