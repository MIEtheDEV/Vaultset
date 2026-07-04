import type { PricePoint } from "@/lib/priceHistory";
import { finishKey } from "@/lib/pricing/justtcgVariants";

// Extract a card's daily price history + 24h change from a stored JustTCG raw
// payload (card_prices.raw). JustTCG returns, per condition/printing variant, a
// `priceChange24hr` (percent) and a `priceHistory` array of daily {p, t} points —
// the card's own market movement, independent of when a user added their copy.
// pokemontcg.io "bedrock" payloads have neither, so those cards return null here.

type RawVariant = {
  printing?: string;
  condition?: string;
  price?: number | null;
  priceChange24hr?: number | null;
  priceHistory?: { p?: number; t?: number }[] | null;
};

// JustTCG raw condition label → our internal condition key (mirror of the map in
// justtcgVariants; kept local so the two never import each other's internals).
const CONDITION_TO_KEY: Record<string, string> = {
  "near mint": "near_mint",
  "lightly played": "lightly_played",
  "moderately played": "moderately_played",
  "heavily played": "heavily_played",
  "damaged": "damaged",
};

// Mirror of PokemonTCGProvider.resolveFinishKey so we match the same variant the
// item's market price was derived from.
function resolveFinishKey(finish: string | null, edition: string | null): string {
  const is1st = edition === "1st_edition";
  switch (finish) {
    case "non_holo":          return is1st ? "1stEditionNormal"   : "normal";
    case "holofoil":          return is1st ? "1stEditionHolofoil" : "holofoil";
    case "reverse_holofoil":  return "reverseHolofoil";
    case "textured_holofoil": return "holofoil";
    case "gold_etched":       return "holofoil";
    default:                  return is1st ? "1stEditionHolofoil" : "holofoil";
  }
}

export interface CardHistoryItem {
  finish: string | null;
  edition?: string | null;
  condition: string | null;
  grader?: string | null;
}

export interface ApiCardHistory {
  /** Daily series at the item's own price scale — empty unless the exact variant matched. */
  points: PricePoint[];
  /** 24h % move for the item's variant (scale-independent, usable even on a near-match). */
  change24hrPct: number | null;
}

// Find the JustTCG variant matching an item's finish/condition, the same way
// getMarketPrice() resolves its price. `exact` means finish AND condition matched
// (so the variant's prices are on the item's own scale, safe to chart).
function matchVariant(raw: unknown, item: CardHistoryItem): { variant: RawVariant; exact: boolean } | null {
  if (item.grader) return null; // graded slabs aren't in JustTCG's (raw/ungraded) data
  const variants = (raw as { variants?: RawVariant[] } | null)?.variants;
  if (!Array.isArray(variants) || variants.length === 0) return null;

  const target = resolveFinishKey(item.finish ?? null, item.edition ?? null);
  const condKey = !item.condition || item.condition === "mint" ? "near_mint" : item.condition;
  const finishCandidates = [target, "holofoil", "normal"];
  const condOf = (v: RawVariant) => CONDITION_TO_KEY[(v.condition ?? "").toLowerCase().trim()];

  for (const fk of finishCandidates) {
    const v = variants.find((x) => finishKey(x.printing) === fk && condOf(x) === condKey);
    if (v) return { variant: v, exact: true };
  }
  for (const fk of finishCandidates) {
    const v = variants.find((x) => finishKey(x.printing) === fk);
    if (v) return { variant: v, exact: false };
  }
  return { variant: variants[0], exact: false };
}

export function extractApiCardHistory(raw: unknown, item: CardHistoryItem): ApiCardHistory | null {
  const m = matchVariant(raw, item);
  if (!m) return null;

  const points: PricePoint[] = m.exact
    ? dedupeByDate(
        (m.variant.priceHistory ?? [])
          .filter((pt): pt is { p: number; t: number } =>
            !!pt && typeof pt.p === "number" && typeof pt.t === "number")
          .map((pt) => ({ date: new Date(pt.t * 1000).toISOString().slice(0, 10), value: pt.p })),
      )
    : [];

  const change24hrPct = typeof m.variant.priceChange24hr === "number" ? m.variant.priceChange24hr : null;
  return { points, change24hrPct };
}

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

export interface ApiCardStats {
  current: number | null;
  change24hrPct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  change90dPct: number | null;
  low30d: number | null;
  high30d: number | null;
  low90d: number | null;
  high90d: number | null;
  low1y: number | null;
  high1y: number | null;
  allTimeHigh: number | null;
  allTimeLow: number | null;
  allTimeHighDate: string | null;
  allTimeLowDate: string | null;
  avg30d: number | null;
  avg90d: number | null;
  /** Where the current price sits within the 30d / 90d range (0 = low, 1 = high). */
  posIn30d: number | null;
  posIn90d: number | null;
  /** Coefficient of variation over 30d, as a percent — a volatility proxy. */
  volatility30dPct: number | null;
  /** Number of price changes over 30d — a liquidity/activity proxy. */
  repricings30d: number | null;
  /** 30d trend slope ($/day). */
  trend30d: number | null;
}

const dateStr = (v: unknown): string | null =>
  typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null;

/** Rich market stats for a card's primary (NM) variant, from the JustTCG raw payload. */
export function extractApiCardStats(raw: unknown, item: CardHistoryItem): ApiCardStats | null {
  const m = matchVariant(raw, item);
  if (!m) return null;
  const v = m.variant as RawVariant & Record<string, unknown>;
  const cov30 = num(v.covPrice30d);
  return {
    current:         num(v.price),
    change24hrPct:   num(v.priceChange24hr),
    change7dPct:     num(v.priceChange7d),
    change30dPct:    num(v.priceChange30d),
    change90dPct:    num(v.priceChange90d),
    low30d:          num(v.minPrice30d),
    high30d:         num(v.maxPrice30d),
    low90d:          num(v.minPrice90d),
    high90d:         num(v.maxPrice90d),
    low1y:           num(v.minPrice1y),
    high1y:          num(v.maxPrice1y),
    allTimeHigh:     num(v.maxPriceAllTime),
    allTimeLow:      num(v.minPriceAllTime),
    allTimeHighDate: dateStr(v.maxPriceAllTimeDate),
    allTimeLowDate:  dateStr(v.minPriceAllTimeDate),
    avg30d:          num(v.avgPrice30d),
    avg90d:          num(v.avgPrice90d),
    posIn30d:        num(v.priceRelativeTo30dRange),
    posIn90d:        num(v.priceRelativeTo90dRange),
    volatility30dPct: cov30 != null ? cov30 * 100 : null,
    repricings30d:   num(v.priceChangesCount30d),
    trend30d:        num(v.trendSlope30d),
  };
}

export interface ApiVariant {
  finishKey: string;
  conditionKey: string;
  price: number | null;
  change24hrPct: number | null;
  change7dPct: number | null;
  points: PricePoint[];
}

/** Every raw JustTCG variant (finish × condition) with its price, movement, and history. */
export function extractApiVariants(raw: unknown): ApiVariant[] {
  const variants = (raw as { variants?: (RawVariant & Record<string, unknown>)[] } | null)?.variants;
  if (!Array.isArray(variants)) return [];
  const out: ApiVariant[] = [];
  for (const v of variants) {
    const conditionKey = CONDITION_TO_KEY[(v.condition ?? "").toLowerCase().trim()];
    if (!conditionKey) continue;
    out.push({
      finishKey: finishKey(v.printing),
      conditionKey,
      price: num(v.price),
      change24hrPct: num(v.priceChange24hr),
      change7dPct: num(v.priceChange7d),
      points: dedupeByDate(
        ((v.priceHistory ?? []) as { p?: number; t?: number }[])
          .filter((pt): pt is { p: number; t: number } => !!pt && typeof pt.p === "number" && typeof pt.t === "number")
          .map((pt) => ({ date: new Date(pt.t * 1000).toISOString().slice(0, 10), value: pt.p })),
      ),
    });
  }
  return out;
}

function dedupeByDate(points: PricePoint[]): PricePoint[] {
  const byDate = new Map<string, number>();
  for (const p of points) byDate.set(p.date, p.value);
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
