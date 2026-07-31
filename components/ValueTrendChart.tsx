"use client";

import { useId } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { chartTheme } from "@/lib/chartTheme";

/**
 * The one value-over-time chart. Every surface that plots a collection's worth
 * against a date axis renders *this* — the dashboard's `VaultPulse` hero and the
 * `PortfolioAnalyticsClient` deep dive.
 *
 * It exists because those two were separately-authored copies of the same
 * AreaChart. They had already drifted: different heights, different tooltip
 * labels, one hard-coding hexes the other took from `chartTheme`, and a y-axis
 * fix applied to one and not the other. A shared component makes "they should
 * match" a property of the code rather than a thing someone has to remember.
 *
 * Callers own their surrounding card, headline, and paywall; this owns the plot,
 * the axes, and the window arithmetic.
 */

export type PricePoint = { date: string; value: number };

export const TREND_RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "All", days: Infinity },
] as const;

export function formatAxisDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * The window's start date, counted back from the series' own newest point rather
 * than from `Date.now()`.
 *
 * Two reasons: reading the clock during render is impure (React lints it, and it
 * makes the rendered window depend on when a re-render happens to occur), and the
 * series is a UTC-dated snapshot calendar — anchoring to its last point keeps the
 * window aligned with the data instead of with the viewer's local midnight.
 */
export function windowStart(series: PricePoint[], days: number): string | null {
  const anchor = series.at(-1)?.date;
  if (!anchor || days === Infinity) return null;
  return new Date(new Date(anchor + "T00:00:00Z").getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Slice `series` to the selected window. */
export function windowSlice(series: PricePoint[], days: number): PricePoint[] {
  const cutoff = windowStart(series, days);
  return cutoff ? series.filter((d) => d.date >= cutoff) : series;
}

/** First-to-last change across a window, or null when there's nothing to compare. */
export function windowChange(
  window: PricePoint[],
): { abs: number; pct: number } | null {
  if (window.length < 2) return null;
  const first = window[0].value;
  const last = window[window.length - 1].value;
  return { abs: last - first, pct: first > 0 ? ((last - first) / first) * 100 : 0 };
}

/**
 * Widen `[lo, hi]` out to round numbers so the axis reads $760/$800/$840 rather
 * than the $771/$811/$851 that falls out of an arbitrary padded range. Snaps the
 * step to a 1/2/5 × 10ⁿ ladder, the usual choice for human-readable ticks.
 */
export function niceDomain(lo: number, hi: number): [number, number] {
  const span = hi - lo;
  if (!(span > 0)) return [Math.max(0, lo - 1), hi + 1];
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return [Math.max(0, Math.floor(lo / step) * step), Math.ceil(hi / step) * step];
}

function formatTick(v: number) {
  return `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(v < 10 ? 2 : 0)}`;
}

/**
 * 7D / 30D / 90D / All.
 *
 * `proFromDays` is the paywall: ranges longer than it render as links to
 * `/pricing` when `canPro` is false, so the upsell lives in the control the user
 * just reached for rather than in a separate card. Pass `Infinity` (the default)
 * on surfaces that are already gated as a whole.
 */
export function TrendRangePicker({
  value,
  onChange,
  canPro = true,
  proFromDays = Infinity,
}: {
  value: number;
  onChange: (days: number) => void;
  canPro?: boolean;
  proFromDays?: number;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface-raised p-1">
      {TREND_RANGES.map(({ label, days }) =>
        !canPro && days > proFromDays ? (
          <Link
            key={label}
            href="/pricing"
            title="Longer history is a Pro feature"
            className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-foreground-muted transition-colors hover:text-gold"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {label}
          </Link>
        ) : (
          <button
            key={label}
            type="button"
            onClick={() => onChange(days)}
            aria-pressed={value === days}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              value === days
                ? "bg-gold text-background"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        )
      )}
    </div>
  );
}

export function ValueTrendChart({
  data,
  height = 180,
  tooltipLabel = "Vault value",
  referenceValue = null,
}: {
  /** Already windowed — pass `windowSlice(series, days)`. */
  data: PricePoint[];
  height?: number;
  tooltipLabel?: string;
  /** Optional horizontal marker (analytics uses it for cost basis). */
  referenceValue?: number | null;
}) {
  // Gradient ids are global to the document, so two charts on one page sharing a
  // literal id would have the second silently adopt the first's fill.
  const fillId = `value-trend-fill-${useId().replace(/:/g, "")}`;

  /*
    Fit the y-axis to the visible window instead of Recharts' zero baseline.

    A collection's value is a large number that moves by a small fraction of
    itself, so anchored at $0 a real 3% month renders as a dead-flat line — the
    chart looked broken and told the user nothing. Zero-baselining is only
    obligatory where mark *length* encodes the value (bars); on a trend line the
    axis labels carry the magnitude, and they're always drawn here.

    A reference line is folded into the extent before padding: cost basis is
    routinely below every plotted point, and a domain fitted to the data alone
    would push it off-canvas — the legend would promise a line that isn't there.
  */
  const values = data.map((d) => d.value);
  if (referenceValue != null) values.push(referenceValue);
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 0;
  const pad = Math.max((dataMax - dataMin) * 0.15, dataMax * 0.02, 1);
  const yDomain = niceDomain(Math.max(0, dataMin - pad), dataMax + pad);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          {/*
            One hue, always gold: the series identity is the collection's value,
            not its direction. Polarity is carried by the ▲/▼ delta text the
            callers render above, which is where a reader looks for it anyway.
            (The dashboard sparkline used to flip to red while the chart below it
            stayed gold — same data, two colours.)
          */}
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartTheme.accent} stopOpacity={0.18} />
            <stop offset="95%" stopColor={chartTheme.accent} stopOpacity={0} />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="date"
          tickFormatter={formatAxisDate}
          tick={{ fontSize: 11, fill: chartTheme.axis }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          domain={yDomain}
          tickFormatter={formatTick}
          tick={{ fontSize: 11, fill: chartTheme.axis }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={{
            background: chartTheme.surface,
            border: `1px solid ${chartTheme.grid}`,
            borderRadius: "12px",
            fontSize: "12px",
            color: "#eef0ff",
          }}
          labelFormatter={(label) => formatAxisDate(String(label))}
          formatter={(value) => [`$${Number(value).toFixed(2)}`, tooltipLabel]}
          cursor={{ stroke: chartTheme.grid, strokeWidth: 1 }}
        />
        {referenceValue != null && (
          <ReferenceLine
            y={referenceValue}
            stroke={chartTheme.axis}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke={chartTheme.accent}
          strokeWidth={2}
          fill={`url(#${fillId})`}
          dot={false}
          activeDot={{ r: 4, fill: chartTheme.accent, stroke: chartTheme.surface, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
