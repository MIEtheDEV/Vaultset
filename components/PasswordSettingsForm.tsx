"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";

function labelClass() {
  return "mb-1.5 block text-sm font-medium text-foreground-muted";
}

/** Change-password form. Verifies the current password before updating. */
export function PasswordSettingsForm({ initialEmail }: { initialEmail: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Fill in all three password fields to change your password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Verify current password before changing it.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: initialEmail,
      password: currentPassword,
    });
    if (verifyError) {
      setError("Current password is incorrect.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess("Password updated successfully.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-foreground-muted">Leave these blank to keep your current password.</p>

      <div>
        <label className={labelClass()}>Current Password</label>
        <PasswordInput
          autoComplete="new-password"
          placeholder="Enter your current password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
      </div>
      <div>
        <label className={labelClass()}>New Password</label>
        <PasswordInput
          autoComplete="new-password"
          placeholder="Min. 8 characters"
          minLength={newPassword ? 8 : undefined}
          value={newPassword}
          onChange={setNewPassword}
        />
      </div>
      <div>
        <label className={labelClass()}>Confirm New Password</label>
        <PasswordInput
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">{success}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
      >
        {loading ? "Updating…" : "Update Password"}
      </button>
    </form>
  );
}
