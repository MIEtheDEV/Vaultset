"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { completeProfileSetup } from "./actions";

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

    // The profile row may not exist yet (OAuth users have no row until now),
    // so creation goes through a server action that writes with the service
    // role — `profiles` grants no client INSERT policy. See actions.ts.
    const result = await completeProfileSetup(username);

    if ("error" in result) {
      setError(result.error);
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
