"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import { OAuthButtons } from "@/components/OAuthButtons";
import { likeEscape } from "@/lib/username";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", likeEscape(username))
      .maybeSingle();

    if (existingProfile) {
      setError("This username is already taken.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, full_name: username },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.user?.identities?.length === 0) {
      setError("An account with this email already exists.");
      setLoading(false);
      return;
    }

    setConfirmed(true);
  }

  if (confirmed) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Check your inbox</h1>
          <p className="mt-2 text-sm text-foreground-muted leading-relaxed">
            We sent a confirmation link to <span className="text-foreground">{email}</span>. Check your spam folder. Our platform is new, so confirmation emails may not land in your inbox. Click it to activate your account.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-gold hover:text-gold-light transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-border bg-surface p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <p className="mt-1 text-sm text-foreground-muted">Start building your collection today</p>
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground-muted">
              Password
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

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-gold cursor-pointer"
            />
            <span className="text-xs text-foreground-muted leading-relaxed">
              I am 13 years of age or older and I agree to the{" "}
              <Link href="/terms" target="_blank" className="text-gold hover:text-gold-light transition-colors">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="text-gold hover:text-gold-light transition-colors">
                Privacy Policy
              </Link>.
            </span>
          </label>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !ageConfirmed}
            className="w-full rounded-xl bg-gold py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
          </form>

        <div className="mt-6">
          <OAuthButtons />
        </div>

        <p className="mt-6 text-center text-sm text-foreground-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-gold hover:text-gold-light transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
