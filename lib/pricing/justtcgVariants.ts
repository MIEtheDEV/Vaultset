import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

// Shared JustTCG variant handling, used by both the price provider (pricing)
// and the search source (catalog). Keeping it in one place means the
// printing→finish mapping and the Near-Mint base-price selection never drift.

export interface JustTcgVariant {
  condition?: string;
  printing?: string;
  price?: number;
}

/** { finishKey: { conditionKey: price } } — real per-condition market prices. */
export type ConditionPrices = Record<string, Record<string, number>>;

// JustTCG raw condition label → our internal condition key.
const CONDITION_MAP: Record<string, string> = {
  "near mint":         "near_mint",
  "lightly played":    "lightly_played",
  "moderately played": "moderately_played",
  "heavily played":    "heavily_played",
  "damaged":           "damaged",
};

/**
 * Build the real per-condition price map from JustTCG variants. Only raw
 * conditions are included (graded slabs aren't in JustTCG). Downstream
 * getMarketPrice() uses the exact condition price when present.
 */
export function variantsToConditionPrices(variants: JustTcgVariant[] = []): ConditionPrices {
  const out: ConditionPrices = {};
  for (const v of variants) {
    if (v.price == null) continue;
    const cKey = CONDITION_MAP[(v.condition ?? "").toLowerCase().trim()];
    if (!cKey) continue;
    const fKey = finishKey(v.printing);
    (out[fKey] ??= {})[cKey] = v.price;
  }
  return out;
}

/** Map a JustTCG "printing" string → pokemontcg.io-style finish key. */
export function finishKey(printing?: string): string {
  switch ((printing ?? "").toLowerCase().trim()) {
    case "normal":                 return "normal";
    case "holofoil":
    case "holo":                   return "holofoil";
    case "reverse holofoil":
    case "reverse holo":           return "reverseHolofoil";
    case "1st edition normal":
    case "1st edition":            return "1stEditionNormal";
    case "1st edition holofoil":   return "1stEditionHolofoil";
    default:                       return "holofoil";
  }
}

/**
 * Map JustTCG variants → the pokemontcg.io `tcgplayer.prices` shape. We take the
 * Near Mint price per printing as the base `market`; downstream getMarketPrice()
 * applies our condition/grade multipliers on top.
 */
export function variantsToPrices(variants: JustTcgVariant[] = []): TcgPlayerData["prices"] {
  const prices: TcgPlayerData["prices"] = {};
  const byFinish = new Map<string, JustTcgVariant[]>();
  for (const v of variants) {
    const key = finishKey(v.printing);
    if (!byFinish.has(key)) byFinish.set(key, []);
    byFinish.get(key)!.push(v);
  }
  for (const [key, vs] of byFinish) {
    const nm = vs.find((v) => /near\s*mint|^nm$/i.test(v.condition ?? "")) ?? vs[0];
    if (nm?.price == null) continue;
    prices[key] = { low: null, mid: null, high: null, market: nm.price, directLow: null };
  }
  return prices;
}
