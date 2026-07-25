import { getRaritySystem } from "@/lib/rarity";

// Shared "chase cards" selection — a set's rarest, most sought-after hits.
//
// Previously duplicated in components/hubs/ChaseCards.tsx and lib/sets/masterset.ts
// with *different* tiebreaks (value vs card number), so the public set hub and the
// master-set page could order the same set's strip differently. One implementation
// now, both call sites read from it.

const raritySystem = getRaritySystem("pokemon");
const RARE_SORT = raritySystem.getSortOrder("rare");

/** Cap the strip so it stays a curated highlight, not a second full grid. */
export const CHASE_LIMIT = 12;

/**
 * Share of the eligible pool that must carry a market price before we rank by
 * value instead of rarity.
 *
 * Ranking by value is what collectors actually mean by "chase" — in Prismatic
 * Evolutions the $1,506 Umbreon ex SIR is the card, yet pure rarity order puts
 * five gold hyper rares worth $6–$64 ahead of it, because `hyper_rare` outranks
 * `special_illustration_rare` in the taxonomy.
 *
 * But value ordering is only meaningful when most of the pool is actually priced.
 * Below this threshold it would rank by *which cards we happened to warm* rather
 * than by worth — the exact failure this codebase has hit before. So a thinly
 * priced set (me2pt5 at 9%, or any set the bedrock sweep hasn't reached) falls
 * back to rarity, and graduates to value ordering on its own as coverage fills in.
 */
export const VALUE_MODE_MIN_COVERAGE = 0.6;

/** The fields the ranking reads. Call sites map their own row shape onto this. */
export interface ChaseFields {
  rarity: string | null;
  value: number | null;
  number: string | null;
  /** Unique per card — the final tiebreak, so the order is never ambiguous. */
  key: string;
}

/** True when this card counts as one of its set's hits at all. */
export function isChaseEligible(rarity: string | null): boolean {
  return rarity != null && raritySystem.getSortOrder(rarity) < RARE_SORT;
}

/**
 * Pick and rank a set's chase cards. Value-first when the pool is well priced,
 * rarity-first otherwise; both branches are total orders, so the result is
 * deterministic and stable across renders either way.
 */
export function selectChaseCards<T>(cards: readonly T[], read: (card: T) => ChaseFields): T[] {
  const pool = cards
    .map((card) => ({ card, f: read(card) }))
    .filter((x) => isChaseEligible(x.f.rarity));
  if (pool.length === 0) return [];

  const byRarity = (a: typeof pool[number], b: typeof pool[number]) =>
    raritySystem.getSortOrder(a.f.rarity!) - raritySystem.getSortOrder(b.f.rarity!)
    || (a.f.number ?? "").localeCompare(b.f.number ?? "", undefined, { numeric: true })
    || a.f.key.localeCompare(b.f.key);

  const priced = pool.filter((x) => x.f.value != null).length;
  const valueMode = priced / pool.length >= VALUE_MODE_MIN_COVERAGE;

  pool.sort(
    valueMode
      // Unpriced cards inside a value-mode pool sort to the tail on -1, then by rarity.
      ? (a, b) => (b.f.value ?? -1) - (a.f.value ?? -1) || byRarity(a, b)
      : byRarity,
  );

  return pool.slice(0, CHASE_LIMIT).map((x) => x.card);
}
