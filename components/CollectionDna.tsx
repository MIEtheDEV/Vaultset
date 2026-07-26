"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { RaritySymbol } from "@/components/RaritySymbol";
import { chartTheme, ordinalGoldStep } from "@/lib/chartTheme";
import type { CollectionInsights, Slice } from "@/lib/collectionInsights";

/**
 * Composition charts for a collection.
 *
 * Form choices, in the order they were decided:
 *
 * - Both are **horizontal bars**, because the job is comparing magnitude and the
 *   category names are long ("Illustration Rare", full set names). Not pies: with
 *   ten-plus rarity tiers a pie is unreadable, and a pie of two is a meter.
 * - **Rarity is ordinal** — swapping the tier order would change the meaning — so it
 *   takes a single-hue ramp (brightest = rarest) and the reader sees the sequence in
 *   the colour. Ordered by tier, never by count.
 * - **Sets are nominal with one series**, so every bar takes the same gold. Colouring
 *   them by value would spend the identity channel re-encoding what bar length
 *   already shows.
 * - **No legend on either**: one series each, so the heading already names what is
 *   plotted. A one-swatch legend just restates the title.
 * - Values are **labelled selectively** (the largest bar only) with the axis and the
 *   hover tooltip carrying the rest, plus a full table view — flooding every bar
 *   with a number stops the labels working.
 */
export function CollectionDna({ insights }: { insights: CollectionInsights }) {
  const [showTable, setShowTable] = useState(false);

  const hasRarity = insights.byRarity.length > 0;
  const hasSets = insights.bySet.length > 0;
  if (!hasRarity && !hasSets) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold text-foreground">Collection DNA</h2>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="text-xs text-foreground-muted transition-colors hover:text-foreground"
        >
          {showTable ? "Show charts" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        // Only the two charts get tables. The condition and finish strips below already
        // print label, count and share as text in their legends, so tabling them again
        // just repeats the same numbers twice on one screen.
        <div className="grid gap-4 lg:grid-cols-2">
          <SliceTable title="By rarity" caption="Rarest first" slices={insights.byRarity} showSymbol />
          <SliceTable title="Biggest sets" caption="By copies held" slices={insights.bySet} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {hasRarity && (
            <ChartPanel
              title="By rarity"
              caption={`${insights.byRarity.length} tier${insights.byRarity.length === 1 ? "" : "s"} · rarest first`}
            >
              <SliceBars slices={insights.byRarity} ordinal />
            </ChartPanel>
          )}
          {hasSets && (
            <ChartPanel
              title="Biggest sets"
              caption={
                insights.uniqueSets > insights.bySet.length
                  ? `Top ${insights.bySet.length} of ${insights.uniqueSets} sets`
                  : `All ${insights.uniqueSets} set${insights.uniqueSets === 1 ? "" : "s"}`
              }
            >
              <SliceBars slices={insights.bySet} />
            </ChartPanel>
          )}
        </div>
      )}
    </section>
  );
}

function ChartPanel({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-foreground-muted">{caption}</p>
      </div>
      {children}
    </div>
  );
}

const ROW_HEIGHT = 32;
const AXIS_WIDTH = 150;
/** Fits AXIS_WIDTH at 11px without wrapping. */
const MAX_TICK_CHARS = 21;

/**
 * Single-line category tick.
 *
 * Recharts' default tick wraps long names onto two lines, which at these row
 * heights makes "Special Illustration Rare" and "ME: Mega Evolution Promo" collide
 * with their neighbours. Truncating keeps one line per row; the full name stays
 * available on hover and in the table view, so nothing is lost — as opposed to
 * clipping with overflow, which would silently eat characters.
 */
function CategoryTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}) {
  const label = String(payload?.value ?? "");
  const short = label.length > MAX_TICK_CHARS ? `${label.slice(0, MAX_TICK_CHARS - 1)}…` : label;

  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill={chartTheme.axis}>
      <title>{label}</title>
      {short}
    </text>
  );
}

function SliceBars({ slices, ordinal = false }: { slices: Slice[]; ordinal?: boolean }) {
  // The one bar worth a direct label. For rarity the list is tier-ordered, so the
  // biggest is not necessarily first.
  const maxIndex = slices.reduce((best, s, i) => (s.count > slices[best].count ? i : best), 0);

  return (
    <div style={{ height: Math.max(slices.length * ROW_HEIGHT, 90) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={slices}
          layout="vertical"
          margin={{ top: 0, right: 34, bottom: 0, left: 0 }}
          barCategoryGap={6}
        >
          {/* Only the value axis gets gridlines; hairline, solid, recessive. */}
          <CartesianGrid horizontal={false} stroke={chartTheme.grid} strokeWidth={1} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: chartTheme.axis }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={AXIS_WIDTH}
            tick={<CategoryTick />}
            // interval={0} is required: with a custom tick element recharts can't
            // measure the text, falls back to its overlap heuristic, and silently
            // drops every other category label — a chart with unlabelled bars.
            interval={0}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.035)" }}
            content={<SliceTooltip />}
          />
          <Bar
            dataKey="count"
            // Square at the baseline, 4px rounded at the data end.
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          >
            {slices.map((s, i) => (
              <Cell key={s.key} fill={ordinal ? ordinalGoldStep(i, slices.length) : chartTheme.accent} />
            ))}
            <LabelList dataKey="count" content={<TipLabel only={maxIndex} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Value at the tip, for one bar only. Text wears a text token, never the bar colour. */
function TipLabel(props: { only?: number; x?: number; y?: number; width?: number; height?: number; value?: number; index?: number }) {
  const { only, x = 0, y = 0, width = 0, height = 0, value, index } = props;
  if (index !== only || value == null) return null;

  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      fill="#eef0ff"
    >
      {value}
    </text>
  );
}

type TooltipPayload = { payload: Slice };

function SliceTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;

  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-foreground">{s.label}</p>
      <p className="mt-0.5 text-xs tabular-nums text-foreground-muted">
        {s.count} {s.count === 1 ? "copy" : "copies"} · {s.pct.toFixed(1)}%
      </p>
      {s.value > 0 && (
        <p className="text-xs tabular-nums text-gold">${s.value.toFixed(2)}</p>
      )}
    </div>
  );
}

/**
 * The table relief. Required rather than optional: rarity routinely runs past the
 * seven-class point where a chart alone stops being the honest answer, and it is
 * what carries the values the charts deliberately don't label.
 */
function SliceTable({
  title,
  caption,
  slices,
  showSymbol = false,
}: {
  title: string;
  caption: string;
  slices: Slice[];
  showSymbol?: boolean;
}) {
  if (slices.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-foreground-muted">{caption}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-foreground-muted">
              <th scope="col" className="py-1.5 text-left font-medium">Name</th>
              <th scope="col" className="py-1.5 text-right font-medium">Copies</th>
              <th scope="col" className="py-1.5 text-right font-medium">Share</th>
              <th scope="col" className="py-1.5 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {slices.map((s) => (
              <tr key={s.key}>
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-1.5">
                    {showSymbol && s.key !== "__unknown" && (
                      <RaritySymbol rarity={s.key} className="h-3 w-auto shrink-0" />
                    )}
                    <span className="truncate text-foreground">{s.label}</span>
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-foreground">{s.count}</td>
                <td className="py-1.5 text-right tabular-nums text-foreground-muted">{s.pct.toFixed(1)}%</td>
                <td className="py-1.5 text-right tabular-nums text-foreground-muted">
                  {s.value > 0 ? `$${s.value.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
