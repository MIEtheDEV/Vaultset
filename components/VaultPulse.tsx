"use client";

import { useState } from "react";
import Link from "next/link";
import type { Change } from "@/lib/priceHistory";
import {
  ValueTrendChart,
  TrendRangePicker,
  TREND_RANGES,
  windowSlice,
  windowChange,
  type PricePoint,
} from "@/components/ValueTrendChart";

/**
 * The dashboard's above-the-fold hook and its only value chart: what your vault
 * is worth, what it did today, and how it got here.
 *
 * This exists because nothing in the product previously gave a returning user a
 * reason to look. The stat tiles showed a total that only moves when you add a
 * card, so two visits a week apart looked identical.
 *
 * Consolidation note: this used to be a bare 30-day sparkline sitting a few
 * hundred pixels above a separate `PortfolioChart` card. Both were fed the same
 * array, so the same trend was drawn twice and the same dollar figure appeared
 * three times on one page (here, the Market Value stat tile, and that card's
 * headline — `withLiveToday` stamps the live total as the final point, so they
 * were the same number by construction). The range control moved here, the
 * second card was deleted, and the plot itself now lives in `ValueTrendChart`,
 * shared with `/dashboard/analytics`.
 *
 * Paywall boundary — depth of history, not which widget you get:
 *   - Today's delta is FREE. It's a single number about value the user already
 *     sees, and gating it would make the daily loop worthless to exactly the
 *     users most likely to churn.
 *   - 7D is FREE. A free user gets a real chart, which is both more useful than
 *     a locked placeholder and a better argument for upgrading than one.
 *   - 30D / 90D / All are PRO. That *is* price-history browsing — the thing
 *     `/dashboard/analytics` already gates. The locked ranges sit in the control
 *     itself, so the upsell is one inline affordance rather than a second card.
 *
 * The series is singles-only: `price_history` snapshots `collection_items`, and
 * sealed products are never written to it. The headline is the true vault total
 * (singles + sealed), so when a user holds sealed product the two legitimately
 * differ and `sealedValue` drives a footnote saying so. Stamping the combined
 * total onto today instead — which is what the old code did — put a fake
 * vertical step at the right edge of the chart equal to the sealed total.
 */

/** Longest window a non-Pro user can select. */
const FREE_RANGE_DAYS = 7;

export function VaultPulse({
  totalValue,
  change,
  series,
  streakDays,
  canPro,
  coveredCount,
  totalCount,
  sealedValue = 0,
}: {
  /** Headline: singles + sealed, matching the Market Value stat. */
  totalValue: number;
  /** Today's move, from provider 24h data. Free for everyone. */
  change: Change | null;
  /** Full singles-only history, oldest first, with today already stamped on. */
  series: PricePoint[];
  streakDays: number;
  canPro: boolean;
  /** How many holdings had a computable move, for the honesty footnote. */
  coveredCount: number;
  totalCount: number;
  /** Sealed-product value, excluded from `series`. Drives the scope footnote. */
  sealedValue?: number;
}) {
  const [selectedRange, setSelectedRange] = useState<number>(canPro ? 30 : FREE_RANGE_DAYS);
  // Clamp rather than trust the state. Without Pro the long ranges render as
  // links to /pricing so nothing *can* set this higher — but the gate belongs on
  // the value that draws the chart, not on the affordance that sets it.
  const rangeDays = canPro ? selectedRange : FREE_RANGE_DAYS;

  const up = change != null && change.abs > 0;
  const down = change != null && change.abs < 0;
  const deltaColor = up ? "text-success" : down ? "text-danger" : "text-foreground-muted";

  const windowed = windowSlice(series, rangeDays);
  // Distinct from `change` above: that one is today's per-card provider move,
  // this one is simply where the line starts and ends. Both are shown because
  // they answer different questions.
  const rangeDelta = windowChange(windowed);
  const rangeLabel = TREND_RANGES.find((r) => r.days === rangeDays)?.label ?? "";

  // No window can plot anything yet (a new account, or one day of snapshots). Drop
  // the range picker and the full-height plot area rather than framing an empty
  // 180px box with controls that can't change what it says — for a vault with no
  // cards the checklist directly above is the whole page, and this shouldn't
  // out-size it. Once two days exist the picker returns, even if the *selected*
  // window is still too short to draw.
  const plottable = series.length >= 2;

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

      {/* Controls row: the window's own change on the left, range picker right. */}
      {plottable && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {rangeDelta ? (
            <p className="text-xs text-foreground-muted">
              <span
                className={`font-medium tabular-nums ${
                  rangeDelta.abs > 0
                    ? "text-success"
                    : rangeDelta.abs < 0
                    ? "text-danger"
                    : "text-foreground-muted"
                }`}
              >
                {rangeDelta.abs >= 0 ? "+" : "−"}${Math.abs(rangeDelta.abs).toFixed(2)} (
                {rangeDelta.abs >= 0 ? "+" : "−"}
                {Math.abs(rangeDelta.pct).toFixed(1)}%)
              </span>{" "}
              over {rangeLabel === "All" ? "all time" : `the last ${rangeLabel.replace("D", " days")}`}
            </p>
          ) : (
            <span />
          )}

          <TrendRangePicker
            value={rangeDays}
            onChange={setSelectedRange}
            canPro={canPro}
            proFromDays={FREE_RANGE_DAYS}
          />
        </div>
      )}

      <div className="mt-3">
        {rangeDelta ? (
          <ValueTrendChart data={windowed} />
        ) : plottable ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm text-foreground-muted">Nothing in this window yet.</p>
            <p className="text-xs text-foreground-muted">
              Try a longer range — history only goes back as far as your first snapshot.
            </p>
          </div>
        ) : (
          <p className="text-xs text-foreground-muted">
            {totalCount === 0
              ? "Your value trend starts once you add a card."
              : "History builds daily — your trend line appears once there are two days of data."}
          </p>
        )}
      </div>

      {/* Footnotes. Both are conditional on there being a chart to footnote. */}
      {plottable && (sealedValue > 0 || !canPro) && (
        <div className="mt-3 space-y-1">
          {sealedValue > 0 && (
            <p className="text-xs text-foreground-muted">
              Trend covers singles only — sealed products (${sealedValue.toFixed(2)}) aren&apos;t
              price-tracked yet, but are included in the total above.
            </p>
          )}
          {!canPro && (
            <p className="text-xs text-foreground-muted">
              Showing the last 7 days.{" "}
              <Link href="/pricing" className="font-medium text-gold hover:underline">
                Upgrade for 30D, 90D and full history →
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
