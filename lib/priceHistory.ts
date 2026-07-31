// Helpers for per-card market-value history and day-over-day change.
//
// Source of truth: the `price_history` table, populated daily (02:00 UTC) by the
// `snapshot_price_history()` cron — one row per held collection_item with a
// non-null market_price, dated `current_date`. See CLAUDE.md pricing layer.

export type PricePoint = { date: string; value: number };

/** A row from the `portfolio_value_history` RPC. */
export type PortfolioHistoryRow = {
  snapshot_date: string;
  total_value: number | string | null;
};

/**
 * Adapt `portfolio_value_history` rows into chart points.
 *
 * The aggregation this replaces ran in JS over raw per-item `price_history`
 * rows, which PostgREST silently truncated at 1000 — oldest-first, so the most
 * recent weeks were the ones that went missing. Both the dashboard and the
 * analytics page now read the same pre-aggregated series through here, so the
 * two can't disagree about what the daily total is.
 *
 * Numeric comes back from PostgREST as a string; the sort is defensive (the
 * function already orders by date).
 */
export function toPricePoints(
  rows: PortfolioHistoryRow[] | null | undefined,
): PricePoint[] {
  return (rows ?? [])
    .filter((r) => r.total_value != null)
    .map((r) => ({
      date: r.snapshot_date,
      value: Math.round(Number(r.total_value) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Today's date (YYYY-MM-DD) in UTC — matches the snapshot cron's `current_date`. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Snapshots are written once daily; a later manual market refresh can move the
 * live value after that. Append (or replace today's point with) the live value so
 * the series ends at what the rest of the UI shows. No-op when live value is null.
 */
export function withLiveToday(
  series: PricePoint[],
  liveValue: number | null | undefined,
  today: string = utcToday(),
): PricePoint[] {
  if (liveValue == null) return series;
  const out = [...series];
  if (out.length > 0 && out[out.length - 1].date === today) {
    out[out.length - 1] = { date: today, value: liveValue };
  } else {
    out.push({ date: today, value: liveValue });
  }
  return out;
}

export type Change = { abs: number; pct: number };

/**
 * Day-over-day change from the last two points of a chronologically-sorted series
 * (current value vs. the most recent prior snapshot). Returns null when there isn't
 * a prior point to compare against, or the prior value is 0.
 */
export function dailyChange(series: PricePoint[]): Change | null {
  if (series.length < 2) return null;
  const curr = series[series.length - 1].value;
  const prev = series[series.length - 2].value;
  if (prev === 0) return null;
  return { abs: curr - prev, pct: ((curr - prev) / prev) * 100 };
}

/**
 * Change from a provider-supplied 24h percentage (e.g. JustTCG `priceChange24hr`),
 * expressed as an absolute $ move at the item's current value scale. The percent is
 * scale-independent, so it's valid even when the exact-condition variant wasn't found.
 */
export function apiDailyChange(
  change24hrPct: number | null | undefined,
  liveValue: number | null | undefined,
): Change | null {
  if (change24hrPct == null || liveValue == null) return null;
  const prev = liveValue / (1 + change24hrPct / 100);
  if (!isFinite(prev) || prev <= 0) return null;
  return { abs: liveValue - prev, pct: change24hrPct };
}

/**
 * Merge a provider's daily series (e.g. seeded from JustTCG priceHistory) with our
 * own price_history snapshots. Our snapshots win on any shared day (they're the
 * item's actually-tracked value); the provider points backfill earlier days. The
 * live value is stamped onto today.
 */
export function mergeDailySeries(
  apiPoints: PricePoint[],
  ownPoints: PricePoint[],
  liveValue: number | null | undefined,
): PricePoint[] {
  const byDate = new Map<string, number>();
  for (const p of apiPoints) byDate.set(p.date, p.value);
  for (const p of ownPoints) byDate.set(p.date, p.value);
  const merged = [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return withLiveToday(merged, liveValue);
}
