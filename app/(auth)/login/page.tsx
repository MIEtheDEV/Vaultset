"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import { resolveLoginEmail } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await resolveLoginEmail(identifier.trim());
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    const email = result.email;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-border bg-surface p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
          <p className="mt-1 text-sm text-foreground-muted">Sign in to your Vaultset account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
              Email or Username
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              placeholder="you@example.com or collector99"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground-muted">Password</label>
              <Link
                href="/forgot-password"
                className="text-xs text-foreground-muted hover:text-gold transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              required
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
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
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground-muted">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-gold hover:text-gold-light transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
