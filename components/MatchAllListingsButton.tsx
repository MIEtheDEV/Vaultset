"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bulkMatchMarket } from "@/app/inventory/bulk-actions";

/**
 * Bulk "match listings to market" — sets list_price = market_price for every
 * item currently for sale. The per-card "List at Market" button remains the
 * individual path; this is its batch equivalent.
 */
export function MatchAllListingsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [count, setCount]     = useState<number | null>(null);
  const [hasError, setError]  = useState(false);

  async function handleClick() {
    setLoading(true);
    setCount(null);
    setError(false);
    try {
      const updated = await bulkMatchMarket();
      setCount(updated);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start sm:items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm font-medium text-gold hover:bg-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        {loading ? "Updating…" : "Update all listings — match market"}
      </button>
      <p className="min-h-4 text-xs text-foreground-muted">
        {hasError && <span className="text-red-400">Update failed — try again</span>}
        {count != null && !hasError && (
          count === 0
            ? <span>Nothing to match — refresh market values first</span>
            : <span className="text-emerald-400">Matched {count} listing{count !== 1 ? "s" : ""}</span>
        )}
      </p>
    </div>
  );
}
