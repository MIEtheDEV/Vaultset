"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  lastRefreshedAt: string | null;
}

function formatRelative(iso: string): string {
  const diff    = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  if (minutes < 1)  return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours   < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RefreshMarketButton({ lastRefreshedAt }: Props) {
  const router = useRouter();
  const [loading,      setLoading]      = useState(false);
  const [updatedCount, setUpdatedCount] = useState<number | null>(null);
  const [needsPro,     setNeedsPro]     = useState(false);
  const [hasError,     setHasError]     = useState(false);

  async function handleRefresh() {
    setLoading(true);
    setUpdatedCount(null);
    setNeedsPro(false);
    setHasError(false);

    try {
      const res = await fetch("/api/market-refresh", { method: "POST" });

      // On-demand bulk refresh is Pro-gated (403 for free users).
      if (res.status === 403) { setNeedsPro(true); return; }
      if (!res.ok)            { setHasError(true); return; }

      const json = await res.json();
      setUpdatedCount(json.updated);
      router.refresh();
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = loading;

  return (
    <div className="flex flex-col items-start sm:items-end gap-1">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isDisabled}
        className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={loading ? "animate-spin" : ""}
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        {loading ? "Refreshing…" : "Refresh Market Data"}
      </button>

      <p className="min-h-4 text-xs text-foreground-muted">
        {hasError && <span className="text-red-400">Refresh failed — try again</span>}
        {needsPro && (
          <a href="/account" className="text-gold hover:underline">
            On-demand refresh is a Pro feature — upgrade
          </a>
        )}
        {updatedCount != null && !hasError && !needsPro && (
          <span className="text-emerald-400">Updated {updatedCount} card{updatedCount !== 1 ? "s" : ""}</span>
        )}
        {!hasError && !needsPro && updatedCount == null && lastRefreshedAt && (
          <span>Last refreshed {formatRelative(lastRefreshedAt)}</span>
        )}
      </p>
    </div>
  );
}
