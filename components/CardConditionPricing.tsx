"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ApiCardStats, ConditionStats } from "@/lib/pricing/cardHistory";
import { apiDailyChange, type PricePoint } from "@/lib/priceHistory";
import { invertedConditions, THIN_MARKET_NOTE } from "@/lib/pricing/conditionAnomaly";
import { DailyChange } from "@/components/DailyChange";
import { CardValueChart } from "@/components/CardValueChart";

// Condition-aware pricing for a card detail page.
//
// Every price-derived block on the page (headline value, period chips, 30-day
// range, insight stats, chart) reads from ONE selection, so they can never
// disagree — the failure this replaces was a hardcoded "(NM)" label sitting above
// a number that, for any card without JustTCG variants, had no condition
// dimension at all.
//
// `options` is empty for bedrock-priced cards. In that case there is nothing to
// select, the selector doesn't render, and the label drops the condition
// qualifier rather than asserting a precision we don't have.

export const CONDITION_LABEL: Record<string, string> = {
  near_mint: "Near Mint",
  lightly_played: "Lightly Played",
  moderately_played: "Moderately Played",
  heavily_played: "Heavily Played",
  damaged: "Damaged",
};

export const CONDITION_SHORT: Record<string, string> = {
  near_mint: "NM", lightly_played: "LP", moderately_played: "MP",
  heavily_played: "HP", damaged: "DMG",
};

const CONDITION_ORDER = ["near_mint", "lightly_played", "moderately_played", "heavily_played", "damaged"];

export type CardPricingFallback = {
  /** Price shown when the source has no per-condition variants. */
  current: number | null;
  stats: ApiCardStats | null;
  points: PricePoint[];
};

type CardPricingValue = {
  options: ConditionStats[];
  selectedKey: string | null;
  setSelectedKey: (k: string) => void;
  /** Price for the active selection, else the condition-agnostic fallback. */
  current: number | null;
  stats: ApiCardStats | null;
  points: PricePoint[];
  /** True only when the displayed number really is condition-scoped. */
  isConditionScoped: boolean;
  /** Conditions priced above a better grade — flagged, never silently corrected. */
  inverted: ReadonlySet<string>;
};

const Ctx = createContext<CardPricingValue | null>(null);

export function useCardPricing(): CardPricingValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCardPricing must be used inside <CardPricingProvider>");
  return v;
}

export function CardPricingProvider({
  options,
  fallback,
  children,
}: {
  options: ConditionStats[];
  fallback: CardPricingFallback;
  children: React.ReactNode;
}) {
  const sorted = useMemo(
    () => [...options].sort(
      (a, b) => CONDITION_ORDER.indexOf(a.conditionKey) - CONDITION_ORDER.indexOf(b.conditionKey),
    ),
    [options],
  );

  // Default to Near Mint so the page opens exactly as it did before.
  const initial = sorted.find((o) => o.conditionKey === "near_mint")?.conditionKey
    ?? sorted[0]?.conditionKey
    ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(initial);

  const selected = sorted.find((o) => o.conditionKey === selectedKey) ?? null;

  const inverted = useMemo(
    () => invertedConditions(
      Object.fromEntries(sorted.map((o) => [o.conditionKey, o.price ?? o.stats.current])),
    ),
    [sorted],
  );

  const value: CardPricingValue = {
    options: sorted,
    selectedKey,
    setSelectedKey,
    current: selected ? selected.price ?? selected.stats.current : fallback.current,
    stats: selected ? selected.stats : fallback.stats,
    points: selected ? selected.points : fallback.points,
    isConditionScoped: !!selected,
    inverted,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── Consuming blocks ─────────────────────────────────────────────────────────

const money = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

/** Headline market value + period movement, scoped to the selected condition. */
export function MarketValueBlock() {
  const { current, stats, selectedKey, isConditionScoped, inverted } = useCardPricing();
  const change24h = apiDailyChange(stats?.change24hrPct, current);
  const isThin = !!selectedKey && inverted.has(selectedKey);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
            Market Value
            {/* Qualify the number ONLY when it is genuinely condition-scoped. */}
            {isConditionScoped && selectedKey && (
              <span className="normal-case"> ({CONDITION_SHORT[selectedKey] ?? selectedKey})</span>
            )}
          </p>
          <p className="mt-1 text-4xl font-bold text-gold leading-none">{money(current)}</p>
        </div>
        {change24h && (
          <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <span>24h</span>
            <DailyChange change={change24h} href="#value-chart" />
          </span>
        )}
      </div>

      <ConditionPicker />

      {isThin && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-400/90">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Thin market — {THIN_MARKET_NOTE}</span>
        </p>
      )}

      {stats ? (
        <div className="mt-4 grid grid-cols-4 gap-2">
          <PctChip label="24h" pct={stats.change24hrPct} />
          <PctChip label="7d"  pct={stats.change7dPct} />
          <PctChip label="30d" pct={stats.change30dPct} />
          <PctChip label="90d" pct={stats.change90dPct} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-foreground-muted">
          Detailed price movement isn&apos;t available for this card&apos;s price source yet.
        </p>
      )}
    </div>
  );
}

/** Price history chart for the selected condition. */
export function ConditionValueChart() {
  const { points, selectedKey, isConditionScoped } = useCardPricing();
  const title = isConditionScoped && selectedKey
    ? `Market Value Over Time · ${CONDITION_LABEL[selectedKey] ?? selectedKey}`
    : "Market Value Over Time";
  return <CardValueChart data={points} title={title} />;
}

/** 30-day range, long-range stats, and activity chips for the selected condition. */
export function PriceInsightsBlock() {
  const { stats, current } = useCardPricing();
  if (!stats) return null;

  const pos30 =
    stats.posIn30d != null ? Math.max(0, Math.min(1, stats.posIn30d))
    : stats.low30d != null && stats.high30d != null && stats.high30d > stats.low30d && current != null
      ? Math.max(0, Math.min(1, (current - stats.low30d) / (stats.high30d - stats.low30d)))
      : null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
      <h2 className="font-semibold text-foreground">Price Insights</h2>

      {pos30 != null && stats.low30d != null && stats.high30d != null && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-foreground-muted">30-day range</span>
            <span className="text-foreground-muted">{Math.round(pos30 * 100)}% of range</span>
          </div>
          <div className="relative h-2 rounded-full bg-surface-raised">
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-gold border-2 border-surface shadow"
              style={{ left: `calc(${pos30 * 100}% - 7px)` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs mt-1.5">
            <span className="font-medium text-foreground">{money(stats.low30d)}</span>
            <span className="font-medium text-foreground">{money(stats.high30d)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
        <Stat label="30d range"    value={priceRange(stats.low30d, stats.high30d)} />
        <Stat label="90d range"    value={priceRange(stats.low90d, stats.high90d)} />
        <Stat label="1-year range" value={priceRange(stats.low1y, stats.high1y)} />
        <Stat label="30d average"  value={money(stats.avg30d)} />
        <Stat label="All-time low"  value={stats.allTimeLow  != null ? `${money(stats.allTimeLow)}${stats.allTimeLowDate ? ` · ${fmtDate(stats.allTimeLowDate)}` : ""}` : "—"} />
        <Stat label="All-time high" value={stats.allTimeHigh != null ? `${money(stats.allTimeHigh)}${stats.allTimeHighDate ? ` · ${fmtDate(stats.allTimeHighDate)}` : ""}` : "—"} />
      </div>

      {(stats.volatility30dPct != null || stats.repricings30d != null || (stats.trend30d != null && stats.trend30d !== 0)) && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {stats.volatility30dPct != null && (
            <Chip label="Volatility" value={volLabel(stats.volatility30dPct)} tone={volTone(stats.volatility30dPct)} />
          )}
          {stats.repricings30d != null && (
            <Chip label="Activity" value={liqLabel(stats.repricings30d)} tone="muted" />
          )}
          {stats.trend30d != null && stats.trend30d !== 0 && (
            <Chip label="30d trend" value={stats.trend30d > 0 ? "Rising" : "Falling"} tone={stats.trend30d > 0 ? "up" : "down"} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Presentational helpers (moved from the page when these blocks became client) ──

function PctChip({ label, pct }: { label: string; pct: number | null }) {
  const up = pct != null && pct > 0;
  const down = pct != null && pct < 0;
  const color = up ? "text-emerald-400" : down ? "text-red-400" : "text-foreground-muted";
  return (
    <div className="rounded-xl border border-border bg-surface-raised px-2 py-2 text-center">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{pct == null ? "—" : `${up ? "+" : ""}${pct.toFixed(1)}%`}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-foreground-muted">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}

function priceRange(lo: number | null, hi: number | null): string {
  if (lo == null && hi == null) return "—";
  return `${money(lo)} – ${money(hi)}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Tone = "up" | "down" | "warn" | "muted";
const volLabel = (pct: number): string => (pct < 8 ? "Low" : pct < 20 ? "Medium" : "High");
const volTone  = (pct: number): Tone   => (pct < 8 ? "up"  : pct < 20 ? "warn"   : "down");
const liqLabel = (n: number): string   => (n > 30 ? "Very active" : n > 8 ? "Active" : n > 0 ? "Light" : "Quiet");

function Chip({ label, value, tone = "muted" }: { label: string; value: string; tone?: Tone }) {
  const cls =
    tone === "up" ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
    : tone === "down" ? "text-red-400 border-red-400/20 bg-red-400/5"
    : tone === "warn" ? "text-gold border-gold/20 bg-gold/5"
    : "text-foreground-muted border-border bg-surface-raised";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${cls}`}>
      <span className="opacity-70">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

/** Segmented condition picker. Renders nothing when the source has no variants. */
function ConditionPicker() {
  const { options, selectedKey, setSelectedKey, inverted } = useCardPricing();
  if (options.length < 2) return null;

  return (
    <div className="mt-4" role="group" aria-label="Card condition">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.conditionKey === selectedKey;
          const isThin = inverted.has(o.conditionKey);
          const label = CONDITION_LABEL[o.conditionKey] ?? o.conditionKey;
          return (
            <button
              key={o.conditionKey}
              type="button"
              onClick={() => setSelectedKey(o.conditionKey)}
              aria-pressed={active}
              title={isThin ? `${label} — thin market` : label}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
              }`}
            >
              {CONDITION_SHORT[o.conditionKey] ?? o.conditionKey}
              {/* Marks the chip before it's selected, so the odd price isn't a
                  surprise only after clicking. */}
              {isThin && <span className="ml-0.5 text-amber-400" aria-hidden="true">*</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
