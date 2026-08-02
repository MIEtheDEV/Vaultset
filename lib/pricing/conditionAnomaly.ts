/**
 * Detects condition prices that sit above a *better* condition — e.g. Lightly
 * Played priced over Near Mint.
 *
 * These are real upstream numbers, not a display bug: TCGplayer's market price
 * is a trailing average of completed sales per condition, so a condition with
 * only a handful of recent sales can average above a heavily-supplied one. It
 * shows up mostly on freshly released sets, where NM supply is enormous (packs
 * are being opened) and played copies barely exist yet — ~35% of our
 * per-condition rows are inverted, concentrated in the newest sets.
 *
 * We surface it rather than "correcting" it. Clamping the ladder monotonic would
 * invent prices we have no evidence for, and these same numbers value real user
 * inventory through `getMarketPrice`.
 */

/** Conditions best → worst. Index doubles as the quality rank. */
export const CONDITION_RANK = [
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
] as const;

/**
 * Condition keys priced *strictly above* at least one better-graded condition.
 *
 * Strictly above on purpose: equal prices across two conditions are common and
 * unremarkable (a cheap card floored by shipping costs), and flagging them would
 * bury the real signal in noise.
 */
export function invertedConditions(
  prices: Record<string, number | null | undefined>,
): Set<string> {
  const out = new Set<string>();

  for (let i = 1; i < CONDITION_RANK.length; i++) {
    const key = CONDITION_RANK[i];
    const price = prices[key];
    if (price == null) continue;

    for (let j = 0; j < i; j++) {
      const better = prices[CONDITION_RANK[j]];
      if (better != null && price > better) {
        out.add(key);
        break;
      }
    }
  }

  return out;
}

export const THIN_MARKET_NOTE =
  "Priced above a better condition — usually a thin market, where too few recent sales at this grade pull the average off. This is the source's real number, not an estimate.";
