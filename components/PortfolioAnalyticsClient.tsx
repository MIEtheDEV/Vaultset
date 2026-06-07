"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export type PricePoint = { date: string; value: number };

export type CardData = {
  id: string;
  name: string;
  set_name: string;
  card_number: string | null;
  image_url: string | null;
  quantity: number;
  paid_price: number | null;
  market_price: number | null;
  condition: string | null;
  grader: string | null;
  grade: string | null;
};

type EnrichedCard = CardData & {
  totalCost: number | null;
  totalValue: number | null;
  gainAbs: number | null;
  roiPct: number | null;
};

type SortKey = "roi_pct" | "gain_abs" | "market_value" | "cost_basis";
type SortDir = "desc" | "asc";

type Props = {
  portfolioHistory: PricePoint[];
  totalMarketValue: number;
  totalCostBasis: number;
  coveredMarketValue: number;
  cardsWithCostBasis: number;
  totalCards: number;
  cards: CardData[];
};

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "All", days: Infinity },
];

const PAGE_SIZE = 50;

function formatAxisDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3">
        <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
          {label}
        </span>
      </div>
      <span className={`text-2xl font-bold ${valueColor ?? "text-foreground"}`}>
        {value}
      </span>
      {sub && <p className="text-xs text-foreground-muted mt-1.5">{sub}</p>}
    </div>
  );
}

function ROIRow({ card }: { card: EnrichedCard }) {
  return (
    <li>
      <Link
        href={`/inventory/${card.id}/edit`}
        className="flex items-center gap-3 px-6 py-3 hover:bg-surface-raised transition-colors"
      >
        <div className="relative h-10 w-7 rounded overflow-hidden flex-shrink-0 bg-surface-raised">
          {card.image_url && (
            <Image
              src={card.image_url}
              alt={card.name}
              fill
              sizes="28px"
              className="object-contain"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{card.name}</p>
          <p className="text-xs text-foreground-muted truncate">{card.set_name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          {card.roiPct != null && (
            <p
              className={`text-sm font-semibold ${
                card.roiPct >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {card.roiPct >= 0 ? "+" : ""}
              {card.roiPct.toFixed(1)}%
            </p>
          )}
          {card.gainAbs != null && (
            <p
              className={`text-xs ${
                card.gainAbs >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {card.gainAbs >= 0 ? "+" : ""}${Math.abs(card.gainAbs).toFixed(2)}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th className="text-right px-4 py-3">
      <button
        onClick={() => onSort(sortKey)}
        className={`text-xs font-medium transition-colors inline-flex items-center gap-1 ${
          active ? "text-gold" : "text-foreground-muted hover:text-foreground"
        }`}
      >
        {label}
        <svg
          width="8"
          height="10"
          viewBox="0 0 8 10"
          fill="currentColor"
          className="opacity-60"
        >
          {active && dir === "asc" ? (
            <path d="M4 1L7 5H1L4 1Z" />
          ) : active && dir === "desc" ? (
            <path d="M4 9L1 5H7L4 9Z" />
          ) : (
            <>
              <path d="M4 1L7 4H1L4 1Z" opacity={0.5} />
              <path d="M4 9L1 6H7L4 9Z" opacity={0.5} />
            </>
          )}
        </svg>
      </button>
    </th>
  );
}

export function PortfolioAnalyticsClient({
  portfolioHistory,
  totalMarketValue,
  totalCostBasis,
  coveredMarketValue,
  cardsWithCostBasis,
  totalCards,
  cards,
}: Props) {
  const [range, setRange] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>("roi_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const unrealizedGain = coveredMarketValue - totalCostBasis;
  const roiPct = totalCostBasis > 0 ? (unrealizedGain / totalCostBasis) * 100 : 0;
  const coveragePct =
    totalMarketValue > 0 ? (coveredMarketValue / totalMarketValue) * 100 : 0;

  const cutoff =
    range === Infinity
      ? null
      : new Date(Date.now() - range * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
  const filteredHistory = cutoff
    ? portfolioHistory.filter((d) => d.date >= cutoff)
    : portfolioHistory;
  const lastValue = filteredHistory.at(-1)?.value ?? 0;
  const firstValue = filteredHistory[0]?.value ?? 0;
  const historyChange = lastValue - firstValue;
  const historyChangePct = firstValue > 0 ? (historyChange / firstValue) * 100 : 0;

  const enrichedCards = useMemo<EnrichedCard[]>(
    () =>
      cards.map((c) => {
        const totalCost = c.paid_price != null ? c.paid_price * c.quantity : null;
        const totalValue = c.market_price != null ? c.market_price * c.quantity : null;
        const gainAbs =
          totalCost != null && totalValue != null ? totalValue - totalCost : null;
        const roiPctCard =
          c.paid_price != null && c.market_price != null && c.paid_price > 0
            ? ((c.market_price - c.paid_price) / c.paid_price) * 100
            : null;
        return { ...c, totalCost, totalValue, gainAbs, roiPct: roiPctCard };
      }),
    [cards]
  );

  const sortedCards = useMemo(() => {
    const copy = [...enrichedCards];
    copy.sort((a, b) => {
      let av: number, bv: number;
      const nullFallback = sortDir === "desc" ? -Infinity : Infinity;
      switch (sortKey) {
        case "roi_pct":
          av = a.roiPct ?? nullFallback;
          bv = b.roiPct ?? nullFallback;
          break;
        case "gain_abs":
          av = a.gainAbs ?? nullFallback;
          bv = b.gainAbs ?? nullFallback;
          break;
        case "market_value":
          av = a.totalValue ?? 0;
          bv = b.totalValue ?? 0;
          break;
        case "cost_basis":
          av = a.totalCost ?? nullFallback;
          bv = b.totalCost ?? nullFallback;
          break;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [enrichedCards, sortKey, sortDir]);

  const totalPages = Math.ceil(sortedCards.length / PAGE_SIZE);
  const pagedCards = sortedCards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const cardsWithRoi = useMemo(
    () =>
      enrichedCards
        .filter((c) => c.roiPct != null)
        .sort((a, b) => (b.roiPct ?? 0) - (a.roiPct ?? 0)),
    [enrichedCards]
  );
  const topGainers = cardsWithRoi.slice(0, 5);
  const topLosers = [...cardsWithRoi]
    .reverse()
    .slice(0, 5)
    .filter((c) => (c.roiPct ?? 0) < 0);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }

  const showCostBasisLine = cardsWithCostBasis >= 3 && totalCostBasis > 0;

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current Value" value={`$${totalMarketValue.toFixed(2)}`} sub="Total market value" />
        <StatCard
          label="Cost Basis"
          value={totalCostBasis > 0 ? `$${totalCostBasis.toFixed(2)}` : "—"}
          sub={
            cardsWithCostBasis > 0
              ? `${cardsWithCostBasis} of ${totalCards} cards tracked`
              : "Add paid prices in inventory"
          }
        />
        <StatCard
          label="Unrealized Gain"
          value={
            totalCostBasis > 0
              ? `${unrealizedGain >= 0 ? "+" : ""}$${Math.abs(unrealizedGain).toFixed(2)}`
              : "—"
          }
          sub={
            totalCostBasis > 0
              ? `On $${coveredMarketValue.toFixed(2)} covered value`
              : undefined
          }
          valueColor={
            totalCostBasis > 0
              ? unrealizedGain >= 0
                ? "text-emerald-400"
                : "text-red-400"
              : undefined
          }
        />
        <StatCard
          label="Overall ROI"
          value={totalCostBasis > 0 ? `${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(1)}%` : "—"}
          sub={
            totalCostBasis > 0
              ? `${coveragePct.toFixed(0)}% of portfolio covered`
              : undefined
          }
          valueColor={
            totalCostBasis > 0
              ? roiPct >= 0
                ? "text-emerald-400"
                : "text-red-400"
              : undefined
          }
        />
      </div>

      {/* Portfolio value chart */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <div>
            <h2 className="font-semibold text-foreground">Portfolio Value Over Time</h2>
            {filteredHistory.length >= 2 ? (
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-foreground">
                  ${lastValue.toFixed(2)}
                </span>
                <span
                  className={`text-xs font-medium ${
                    historyChange >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {historyChange >= 0 ? "+" : ""}
                  {historyChange.toFixed(2)} ({historyChange >= 0 ? "+" : ""}
                  {historyChangePct.toFixed(1)}%)
                </span>
              </div>
            ) : (
              <p className="text-xs text-foreground-muted mt-1">
                Collection value over time
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-raised p-1">
            {RANGES.map(({ label, days }) => (
              <button
                key={label}
                onClick={() => setRange(days)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  range === days
                    ? "bg-gold text-background"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-1">
            <p className="text-sm text-foreground-muted">Not enough data yet.</p>
            <p className="text-xs text-foreground-muted">
              History builds daily — check back tomorrow.
            </p>
          </div>
        ) : (
          <>
            {showCostBasisLine && (
              <div className="flex items-center gap-2 mb-3">
                <svg width="20" height="4" viewBox="0 0 20 4">
                  <line
                    x1="0" y1="2" x2="20" y2="2"
                    stroke="#6b7194"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                </svg>
                <span className="text-xs text-foreground-muted">
                  Cost basis: ${totalCostBasis.toFixed(2)}
                </span>
              </div>
            )}
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={filteredHistory}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="goldFillAnalytics" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e8b84b" stopOpacity={0.18} />
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
                  tickFormatter={(v: number) =>
                    `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
                  }
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
                  formatter={(value) => [
                    `$${Number(value).toFixed(2)}`,
                    "Portfolio Value",
                  ]}
                  cursor={{ stroke: "#1e2440", strokeWidth: 1 }}
                />
                {showCostBasisLine && (
                  <ReferenceLine
                    y={totalCostBasis}
                    stroke="#6b7194"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    strokeOpacity={0.6}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#e8b84b"
                  strokeWidth={2}
                  fill="url(#goldFillAnalytics)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: "#e8b84b",
                    stroke: "#0f1424",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* No cost basis callout */}
      {cardsWithCostBasis === 0 && (
        <div className="rounded-2xl border border-gold/20 bg-gold/5 p-6 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">No cost basis data yet</p>
          <p className="text-xs text-foreground-muted max-w-sm mx-auto">
            Add a &ldquo;paid price&rdquo; when editing cards in your inventory to unlock ROI
            tracking, gainers, and losers.
          </p>
          <Link
            href="/inventory"
            className="inline-block mt-1 text-xs text-gold hover:text-gold-light transition-colors"
          >
            Go to Inventory →
          </Link>
        </div>
      )}

      {/* Top Gainers / Losers */}
      {(topGainers.length > 0 || topLosers.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {topGainers.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-6 py-4">
                <h3 className="font-semibold text-foreground">Top Gainers</h3>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Highest ROI in your collection
                </p>
              </div>
              <ul className="divide-y divide-border">
                {topGainers.map((c) => (
                  <ROIRow key={c.id} card={c} />
                ))}
              </ul>
            </div>
          )}
          {topLosers.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-6 py-4">
                <h3 className="font-semibold text-foreground">Top Losers</h3>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Biggest losses in your collection
                </p>
              </div>
              <ul className="divide-y divide-border">
                {topLosers.map((c) => (
                  <ROIRow key={c.id} card={c} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Full card breakdown */}
      <div className="rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-6 py-4">
          <h3 className="font-semibold text-foreground">Card Breakdown</h3>
          <p className="text-xs text-foreground-muted mt-0.5">{totalCards} cards total</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-xs font-medium text-foreground-muted">
                  Card
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">
                  Qty
                </th>
                <SortHeader
                  label="Cost Basis"
                  sortKey="cost_basis"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Current Value"
                  sortKey="market_value"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Gain / Loss"
                  sortKey="gain_abs"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="ROI"
                  sortKey="roi_pct"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedCards.map((card) => (
                <tr key={card.id} className="hover:bg-surface-raised transition-colors">
                  <td className="px-6 py-3">
                    <Link
                      href={`/inventory/${card.id}/edit`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="relative h-10 w-7 rounded overflow-hidden flex-shrink-0 bg-surface-raised">
                        {card.image_url && (
                          <Image
                            src={card.image_url}
                            alt={card.name}
                            fill
                            sizes="28px"
                            className="object-contain"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-gold transition-colors">
                          {card.name}
                        </p>
                        <p className="text-xs text-foreground-muted truncate">
                          {card.set_name}
                          {card.card_number ? ` · ${card.card_number}` : ""}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-foreground-muted">
                    {card.quantity}
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-foreground">
                    {card.totalCost != null ? (
                      `$${card.totalCost.toFixed(2)}`
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-foreground">
                    {card.totalValue != null ? (
                      `$${card.totalValue.toFixed(2)}`
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3 text-sm">
                    {card.gainAbs != null ? (
                      <span
                        className={
                          card.gainAbs >= 0 ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {card.gainAbs >= 0 ? "+" : "−"}$
                        {Math.abs(card.gainAbs).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3 text-sm">
                    {card.roiPct != null ? (
                      <span
                        className={
                          card.roiPct >= 0 ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {card.roiPct >= 0 ? "+" : ""}
                        {card.roiPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <p className="text-xs text-foreground-muted">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, sortedCards.length)} of {sortedCards.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-xs text-foreground-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
