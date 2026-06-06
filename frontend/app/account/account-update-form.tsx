"use client";

import Link from "next/link";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { AccountProfile } from "../account-menu";

type Props = {
  profile: AccountProfile;
  userId: string;
  authEmail?: string | null;
};

type FieldErrors = Partial<Record<"fullName" | "phone" | "wechat" | "email" | "password", string>>;

export function AccountUpdateForm({ profile, userId, authEmail }: Props) {
  const [form, setForm] = useState({
    fullName: profile.full_name ?? "",
    phone: profile.phone ?? "",
    wechat: profile.wechat ?? "",
    email: profile.email ?? authEmail ?? "",
    password: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    setGeneralError(null);

    const nextErrors: FieldErrors = {};
    if (!form.fullName.trim()) nextErrors.fullName = "Full name is required.";
    if (!form.phone.trim()) nextErrors.phone = "Phone number is required.";
    if (!form.wechat.trim()) nextErrors.wechat = "WeChat ID is required.";
    if (!form.email.trim()) nextErrors.email = "Email is required.";
    if (form.password && form.password.length < 8) {
      nextErrors.password = "New password must be at least 8 characters.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const emailChanged = form.email.trim().toLowerCase() !== (profile.email ?? authEmail ?? "").toLowerCase();
      const phoneChanged = form.phone.trim() !== (profile.phone ?? "");
      const wechatChanged = form.wechat.trim() !== (profile.wechat ?? "");

      if (emailChanged || phoneChanged || wechatChanged) {
        const { data: conflicts, error: conflictError } = await supabase.rpc(
          "registration_conflicts",
          {
            p_email: emailChanged ? form.email.trim() : null,
            p_phone: phoneChanged ? form.phone.trim() : null,
            p_wechat: wechatChanged ? form.wechat.trim() : null,
          },
        );

        if (conflictError) {
          setGeneralError("Could not check whether your new details are available.");
          return;
        }

        const conflict = Array.isArray(conflicts) ? conflicts[0] : conflicts;
        if (conflict?.email_taken || conflict?.phone_taken || conflict?.wechat_taken) {
          setErrors({
            email: conflict.email_taken ? "This email is already registered." : undefined,
            phone: conflict.phone_taken ? "This phone number is already in use." : undefined,
            wechat: conflict.wechat_taken ? "This WeChat ID is already in use." : undefined,
          });
          return;
        }
      }

      if (emailChanged || form.password) {
        const { error: authError } = await supabase.auth.updateUser({
          email: emailChanged ? form.email.trim() : undefined,
          password: form.password || undefined,
        });

        if (authError) {
          setGeneralError(authError.message);
          return;
        }
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: form.fullName.trim(),
          phone: form.phone.trim(),
          wechat: form.wechat.trim(),
          email: form.email.trim(),
        })
        .eq("id", userId);

      if (profileError) {
        setGeneralError(profileError.message);
        return;
      }

      setForm((current) => ({ ...current, password: "" }));
      setMessage(
        emailChanged
          ? "Information updated. If Supabase requires email confirmation, please check your inbox."
          : "Information updated.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="account-form" onSubmit={onSubmit} noValidate>
      {generalError && <div className="alert alert-error">{generalError}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="field-grid">
        <AccountField
          label="Full name"
          value={form.fullName}
          onChange={update("fullName")}
          error={errors.fullName}
          autoComplete="name"
        />
        <AccountField
          label="WeChat ID"
          value={form.wechat}
          onChange={update("wechat")}
          error={errors.wechat}
        />
        <AccountField
          label="Phone number"
          value={form.phone}
          onChange={update("phone")}
          error={errors.phone}
          autoComplete="tel"
        />
        <AccountField
          label="Email address"
          type="email"
          value={form.email}
          onChange={update("email")}
          error={errors.email}
          autoComplete="email"
        />
      </div>

      <div className="password-panel">
        <AccountField
          label="Change password"
          type="password"
          value={form.password}
          onChange={update("password")}
          error={errors.password}
          placeholder="Leave blank to keep current password"
          autoComplete="new-password"
        />
      </div>

      <div className="account-form-actions">
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save updates"}
        </button>
        <Link href="/reservation" className="secondary-link modal-secondary">
          Back to reservation
        </Link>
      </div>
    </form>
  );
}

function AccountField({
  label,
  error,
  ...props
}: {
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input className="input" aria-invalid={error ? "true" : undefined} {...props} />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
