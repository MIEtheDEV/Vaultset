"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PricePoint } from "@/lib/priceHistory";

const RANGES = [
  { label: "7D",  days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "All", days: Infinity },
];

function formatAxisDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Per-card market-value history. Mirrors PortfolioChart's styling; the series is a
// single card's price_history (see lib/priceHistory).
export function CardValueChart({
  data = [],
  title = "Market Value",
  series,
}: {
  data?: PricePoint[];
  title?: string;
  series?: { label: string; points: PricePoint[] }[];
}) {
  const [range, setRange] = useState(30);
  const [seriesIdx, setSeriesIdx] = useState(0);

  const hasSeries = !!series && series.length > 0;
  const activeIdx = hasSeries ? Math.min(seriesIdx, series!.length - 1) : 0;
  const source = hasSeries ? series![activeIdx].points : data;

  const cutoff =
    range === Infinity
      ? null
      : new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const filtered = cutoff ? source.filter((d) => d.date >= cutoff) : source;

  const last  = filtered.at(-1)?.value ?? 0;
  const first = filtered[0]?.value ?? 0;
  const change    = last - first;
  const changePct = first > 0 ? (change / first) * 100 : 0;
  const isUp      = change >= 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          {filtered.length >= 2 ? (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-foreground">${last.toFixed(2)}</span>
              <span className={`text-xs font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? "+" : ""}
                {change.toFixed(2)} ({isUp ? "+" : ""}
                {changePct.toFixed(1)}%)
              </span>
              <span className="text-xs text-foreground-muted">over this range</span>
            </div>
          ) : (
            <p className="text-xs text-foreground-muted mt-1">Market value over time</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasSeries && series!.length > 1 && (
            <select
              value={activeIdx}
              onChange={(e) => setSeriesIdx(Number(e.target.value))}
              className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
            >
              {series!.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-raised p-1">
            {RANGES.map(({ label, days }) => (
              <button
                key={label}
                onClick={() => setRange(days)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  range === days ? "bg-gold text-background" : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length < 2 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-1">
          <p className="text-sm text-foreground-muted">Not enough data yet.</p>
          <p className="text-xs text-foreground-muted">History builds daily — check back tomorrow.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={filtered} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cardValueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#e8b84b" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#e8b84b" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              tick={{ fontSize: 11, fill: "#6b7194" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`}
              tick={{ fontSize: 11, fill: "#6b7194" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: "#0f1424",
                border: "1px solid #1e2440",
                borderRadius: "12px",
                fontSize: "12px",
                color: "#eef0ff",
              }}
              labelFormatter={(label) => formatAxisDate(String(label))}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, "Market Value"]}
              cursor={{ stroke: "#1e2440", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#e8b84b"
              strokeWidth={2}
              fill="url(#cardValueFill)"
              dot={false}
              activeDot={{ r: 4, fill: "#e8b84b", stroke: "#0f1424", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
