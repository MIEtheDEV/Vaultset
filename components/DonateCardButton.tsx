"use client";

import { useState } from "react";

/**
 * Card-donation CTA for signed-in users. Creates a server-side donation
 * Checkout Session (tied to the user via client_reference_id) and redirects to
 * it, so a successful donation auto-grants the Supporter flag. Logged-out donors
 * use the static Payment Link instead — this component is only rendered for
 * authenticated users.
 */
export function DonateCardButton({ label, className }: { label: string; className: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/stripe/donate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shrink-0 self-start sm:self-center flex flex-col items-end gap-1">
      <button type="button" onClick={handleClick} disabled={loading} className={className}>
        {loading ? "Loading…" : label}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
