// Composition of a collection: what it's made of, and where its value sits.
//
// A tracker with rarity, set, condition, finish and grade dimensions was showing
// none of them — the only visualisation in the app was a portfolio area chart, and
// `recharts` shipped with exactly one of its chart types in use.
//
// Everything here is a pure fold over rows the inventory page already loads, so it
// is fully unit-testable and adds no queries of its own.
//
// Deliberately excluded: anything comparing paid price to market value. That is ROI,
// which is a Pro feature on /dashboard/analytics — this page stays free because
// "what is my collection made of" is not the same product as "what did it earn".

import { getRaritySystem } from "@/lib/rarity";

export type InsightCard = {
  name: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  game: string | null;
  game_data: Record<string, unknown> | null;
};

/** The subset of a `collection_items` row this module needs. */
export type InsightItem = {
  quantity: number | null;
  market_price: number | null;
  condition: string | null;
  finish: string | null;
  grader: string | null;
  cards: InsightCard | InsightCard[] | null;
};

export type Slice = {
  key: string;
  label: string;
  /** Physical copies, so a x4 line counts four times. */
  count: number;
  value: number;
  /** Share of total copies, 0–100. */
  pct: number;
  /** Position in the dimension's natural order — drives the ordinal colour ramp. */
  rank: number;
};

export type TopCard = { name: string; setName: string | null; value: number; pct: number };

export type CollectionInsights = {
  totalCopies: number;
  /** Distinct inventory lines, which is what "unique cards" means to a collector. */
  uniqueLines: number;
  uniqueSets: number;
  totalValue: number;
  gradedCopies: number;
  /** Graded share of copies, 0–100. */
  gradedPct: number;
  /** Copies with a known market price — the honesty denominator for value figures. */
  pricedCopies: number;
  byRarity: Slice[];
  bySet: Slice[];
  byCondition: Slice[];
  byFinish: Slice[];
  concentration: {
    topN: number;
    /** Share of total value held by the top N lines, 0–100. */
    pct: number;
    cards: TopCard[];
  };
};

// Playing-condition order, best to worst. Ordinal: swapping it would change meaning.
const CONDITION_ORDER = [
  "mint",
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
] as const;

const CONDITION_LABEL: Record<string, string> = {
  mint: "Mint",
  near_mint: "Near Mint",
  lightly_played: "Lightly Played",
  moderately_played: "Moderately Played",
  heavily_played: "Heavily Played",
  damaged: "Damaged",
};

const FINISH_LABEL: Record<string, string> = {
  non_holo: "Non-Holo",
  holofoil: "Holofoil",
  reverse_holofoil: "Reverse Holofoil",
  textured_holofoil: "Textured Holofoil",
  gold_etched: "Gold Etched",
};

function unwrap(cards: InsightCard | InsightCard[] | null): InsightCard | null {
  return Array.isArray(cards) ? (cards[0] ?? null) : cards;
}

function titleise(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type Bucket = { count: number; value: number; label: string; rank: number };

function toSlices(buckets: Map<string, Bucket>, totalCopies: number): Slice[] {
  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: b.label,
      count: b.count,
      value: round2(b.value),
      pct: totalCopies > 0 ? (b.count / totalCopies) * 100 : 0,
      rank: b.rank,
    }))
    .sort((a, b) => a.rank - b.rank || b.count - a.count || a.label.localeCompare(b.label));
}

export function computeCollectionInsights(
  items: InsightItem[],
  { game = "pokemon", topN = 5, maxSets = 8 }: { game?: string; topN?: number; maxSets?: number } = {},
): CollectionInsights {
  const rarity = getRaritySystem(game);

  const rarityBuckets = new Map<string, Bucket>();
  const setBuckets = new Map<string, Bucket>();
  const conditionBuckets = new Map<string, Bucket>();
  const finishBuckets = new Map<string, Bucket>();
  const setNames = new Set<string>();

  let totalCopies = 0;
  let totalValue = 0;
  let gradedCopies = 0;
  let pricedCopies = 0;
  const lineValues: TopCard[] = [];

  const bump = (
    map: Map<string, Bucket>,
    key: string,
    label: string,
    rank: number,
    copies: number,
    value: number,
  ) => {
    const b = map.get(key);
    if (b) {
      b.count += copies;
      b.value += value;
    } else {
      map.set(key, { count: copies, value, label, rank });
    }
  };

  for (const item of items) {
    const copies = item.quantity ?? 1;
    const price = item.market_price;
    const lineValue = price != null ? price * copies : 0;

    totalCopies += copies;
    totalValue += lineValue;
    if (price != null) pricedCopies += copies;
    if (item.grader) gradedCopies += copies;

    const card = unwrap(item.cards);
    const gd = (card?.game_data ?? {}) as Record<string, unknown>;

    // Rarity — ordinal, ordered by the rarity system's own tier ordering so the
    // colour ramp reads as a progression rather than an arbitrary sequence.
    const rarityKey = typeof gd.rarity === "string" && gd.rarity ? gd.rarity : "";
    if (rarityKey) {
      bump(
        rarityBuckets,
        rarityKey,
        rarity.getDisplayLabel(rarityKey) || titleise(rarityKey),
        rarity.getSortOrder(rarityKey),
        copies,
        lineValue,
      );
    } else {
      // Hand-entered cards often have no rarity. Sorted last via a large rank.
      bump(rarityBuckets, "__unknown", "Unrecorded", Number.MAX_SAFE_INTEGER, copies, lineValue);
    }

    // Sets — nominal, so ranked by size and re-sorted below.
    const setName = card?.set_name?.trim();
    if (setName) {
      setNames.add(setName);
      bump(setBuckets, setName, setName, 0, copies, lineValue);
    }

    const condKey = item.condition ?? "";
    if (condKey) {
      const idx = CONDITION_ORDER.indexOf(condKey as (typeof CONDITION_ORDER)[number]);
      bump(
        conditionBuckets,
        condKey,
        CONDITION_LABEL[condKey] ?? titleise(condKey),
        idx === -1 ? CONDITION_ORDER.length : idx,
        copies,
        lineValue,
      );
    }

    const finishKey = item.finish ?? "";
    if (finishKey) {
      bump(finishBuckets, finishKey, FINISH_LABEL[finishKey] ?? titleise(finishKey), 0, copies, lineValue);
    }

    if (price != null && lineValue > 0) {
      lineValues.push({
        name: card?.name ?? "Unknown card",
        setName: card?.set_name ?? null,
        value: round2(lineValue),
        pct: 0, // filled once the total is known
      });
    }
  }

  // Sets are nominal: rank by copies held, biggest first, and cap the list. The
  // tail is dropped rather than folded into "Other" — an "Other" bar in a
  // biggest-sets chart invites reading it as a set.
  const bySet = [...setBuckets.entries()]
    .map(([key, b]) => ({
      key,
      label: b.label,
      count: b.count,
      value: round2(b.value),
      pct: totalCopies > 0 ? (b.count / totalCopies) * 100 : 0,
      rank: 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, maxSets)
    .map((s, i) => ({ ...s, rank: i }));

  const topCards = lineValues
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)
    .map((c) => ({ ...c, pct: totalValue > 0 ? (c.value / totalValue) * 100 : 0 }));

  const concentrationValue = topCards.reduce((s, c) => s + c.value, 0);

  return {
    totalCopies,
    uniqueLines: items.length,
    uniqueSets: setNames.size,
    totalValue: round2(totalValue),
    gradedCopies,
    gradedPct: totalCopies > 0 ? (gradedCopies / totalCopies) * 100 : 0,
    pricedCopies,
    byRarity: toSlices(rarityBuckets, totalCopies),
    bySet,
    byCondition: toSlices(conditionBuckets, totalCopies),
    byFinish: toSlices(finishBuckets, totalCopies).sort((a, b) => b.count - a.count),
    concentration: {
      topN,
      pct: totalValue > 0 ? (concentrationValue / totalValue) * 100 : 0,
      cards: topCards,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
