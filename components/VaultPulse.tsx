"use client";

import Link from "next/link";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { PricePoint, Change } from "@/lib/priceHistory";
import { chartTheme } from "@/lib/chartTheme";

/**
 * The dashboard's above-the-fold hook: what your vault is worth, and what it did
 * today.
 *
 * This exists because nothing in the product previously gave a returning user a
 * reason to look. The stat tiles showed a total that only moves when you add a
 * card, so two visits a week apart looked identical.
 *
 * Paywall boundary (see TODO.md Phase 6.1):
 *   - Today's delta is FREE. It's a single number about value the user already
 *     sees, and gating it would make the daily loop worthless to exactly the
 *     users most likely to churn.
 *   - The 30-day sparkline is PRO, because that *is* price-history browsing —
 *     the thing `/dashboard/analytics` and the full PortfolioChart already gate.
 *     Free users get a locked teaser in its place, which is a better upsell
 *     surface than an empty panel.
 */
export function VaultPulse({
  totalValue,
  change,
  series,
  streakDays,
  canPro,
  coveredCount,
  totalCount,
}: {
  totalValue: number;
  change: Change | null;
  series: PricePoint[];
  streakDays: number;
  canPro: boolean;
  /** How many holdings had a computable move, for the honesty footnote. */
  coveredCount: number;
  totalCount: number;
}) {
  const up = change != null && change.abs > 0;
  const down = change != null && change.abs < 0;
  const deltaColor = up ? "text-success" : down ? "text-danger" : "text-foreground-muted";
  const trendColor = down ? chartTheme.danger : chartTheme.accent;

  return (
    <section className="rise-in rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Your Vault</p>

          <p className="mt-2 text-3xl sm:text-4xl font-bold tabular-nums text-foreground">
            ${totalValue.toFixed(2)}
          </p>

          {change ? (
            <p className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${deltaColor}`}>
              <span aria-hidden>{up ? "▲" : down ? "▼" : "•"}</span>
              <span className="tabular-nums">
                {change.abs >= 0 ? "+" : "−"}${Math.abs(change.abs).toFixed(2)} (
                {change.abs >= 0 ? "+" : "−"}
                {Math.abs(change.pct).toFixed(1)}%)
              </span>
              <span className="text-foreground-muted font-normal">today</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-foreground-muted">
              {totalCount === 0
                ? "Add a card to start tracking daily movement."
                : "No price movement recorded yet — check back tomorrow."}
            </p>
          )}

          {/*
            Be explicit when the delta covers only part of the vault. Prices come
            from a shared cache that fills in over time, so a partial number is
            normal — but silently reporting it as the whole portfolio would be a
            lie about coverage.
          */}
          {change != null && coveredCount < totalCount && (
            <p className="mt-1 text-xs text-foreground-muted">
              Based on {coveredCount} of {totalCount} cards with price data.
            </p>
          )}
        </div>

        {streakDays >= 2 && (
          <div
            className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5"
            title={`You've checked in ${streakDays} days in a row`}
          >
            <span aria-hidden>🔥</span>
            <span className="text-sm font-semibold text-gold tabular-nums">{streakDays}</span>
            <span className="text-xs text-foreground-muted">day streak</span>
          </div>
        )}
      </div>

      <div className="mt-5 h-16">
        {canPro ? (
          series.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="vault-pulse-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trendColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={trendColor}
                  strokeWidth={2}
                  fill="url(#vault-pulse-fill)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center text-xs text-foreground-muted">
              History builds daily — your trend line appears once there are two days of data.
            </p>
          )
        ) : (
          <Link
            href="/pricing"
            className="group flex h-full items-center justify-between rounded-xl border border-dashed border-border px-4 transition-colors hover:border-gold/40"
          >
            <span className="text-xs text-foreground-muted">
              See your 30-day trend and full price history
            </span>
            <span className="text-xs font-medium text-gold group-hover:underline">Upgrade →</span>
          </Link>
        )}
      </div>
    </section>
  );
}
