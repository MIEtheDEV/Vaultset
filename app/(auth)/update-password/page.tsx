"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-border bg-surface p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Set a new password</h1>
          <p className="mt-1 text-sm text-foreground-muted">Choose something strong.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
              New password
            </label>
            <PasswordInput
              required
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              minLength={8}
              value={password}
              onChange={setPassword}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
              Confirm new password
            </label>
            <PasswordInput
              required
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={setConfirm}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gold py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {loading ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
