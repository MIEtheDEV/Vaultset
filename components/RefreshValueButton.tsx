"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshItemMarketValue } from "@/app/inventory/bulk-actions";

/**
 * Per-card "refresh market value" control. Pulls the current market value for a
 * single inventory item through the cascading engine and persists it to
 * market_price. Independent of listing price.
 */
export function RefreshValueButton({ itemId }: { itemId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation(); // don't toggle card selection in select mode
    if (loading) return;
    setLoading(true);
    try {
      await refreshItemMarketValue(itemId);
      router.refresh();
    } catch {
      /* ignore — value simply stays as-is */
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title="Refresh market value"
      aria-label="Refresh market value"
      className="text-foreground-muted hover:text-gold transition-colors disabled:opacity-50"
    >
      <svg
        width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        className={loading ? "animate-spin" : ""}
      >
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  );
}
