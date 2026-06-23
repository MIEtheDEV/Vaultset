"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Backfills market values for inventory items that have none (bedrock-first, no
 * JustTCG quota spend). Available to all users — initial population is free.
 */
export function FillMissingPricesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);

  async function handleClick() {
    setLoading(true);
    setUpdated(null);
    setHasError(false);
    try {
      const res  = await fetch("/api/inventory/backfill-prices", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setHasError(true); return; }
      setUpdated(json.updated);
      router.refresh();
    } catch {
      setHasError(true);
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
        className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={loading ? "animate-spin" : ""}
        >
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        {loading ? "Filling…" : "Fill missing prices"}
      </button>

      <p className="min-h-4 text-xs text-foreground-muted">
        {hasError && <span className="text-red-400">Failed — try again</span>}
        {updated != null && !hasError && (
          <span className="text-emerald-400">
            {updated > 0 ? `Filled ${updated} card${updated !== 1 ? "s" : ""}` : "No missing prices"}
          </span>
        )}
      </p>
    </div>
  );
}
