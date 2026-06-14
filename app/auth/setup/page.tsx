"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

function AuthSetupForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const next         = searchParams.get("next") ?? "/dashboard";

  const [username, setUsername] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const trimmed = username.trim().toLowerCase();

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", trimmed)
      .maybeSingle();

    if (existing) {
      setError("This username is already taken.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { username: trimmed, full_name: trimmed },
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // The profile row already exists (created by the handle_new_user trigger),
    // so UPDATE it. An upsert would run as INSERT…ON CONFLICT and require an
    // INSERT RLS policy that profiles intentionally doesn't grant — that's what
    // surfaced "new row violates row-level security policy for table profiles".
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", user.id);

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-border bg-surface p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Choose a username</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            This is how other collectors will find you on Vaultset.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
              Username
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              placeholder="collector99"
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_]+"
              title="Letters, numbers, and underscores only"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
            />
            <p className="mt-1.5 text-xs text-foreground-muted">
              Letters, numbers, and underscores only. Min. 3 characters.
            </p>
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
            {loading ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AuthSetupPage() {
  return (
    <Suspense>
      <AuthSetupForm />
    </Suspense>
  );
}
