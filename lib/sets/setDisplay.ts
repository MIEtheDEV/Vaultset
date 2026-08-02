import { FINISH_ORDER, FINISH_LABELS } from "@/lib/sets/setCardFinishes";

// Pure, client-safe display helpers for master-set UI (no server-only deps).

/**
 * Split a tracked card count into numbered base cards vs secret rares (the cards
 * numbered above `printedTotal`, e.g. #192+ in a 191-card set).
 */
export function splitSecretRares(total: number, printedTotal?: number): { regular: number; secret: number } {
  const secret = printedTotal && printedTotal < total ? total - printedTotal : 0;
  return { regular: total - secret, secret };
}

export interface FinishTally {
  finish: string;
  label: string;
  count: number;
}

/**
 * How many printings of each finish the set contains — the master-set
 * denominator broken out by variant, so the header can say "76 Reverse Holo"
 * instead of leaving the reader to wonder why 122 cards make 198 printings.
 *
 * Counts printings, NOT cards: a card that exists as both normal and reverse
 * holo adds one to each tally. The tallies therefore sum to the master total.
 * Ordered base → premium (FINISH_ORDER); finishes absent from the set are
 * omitted rather than listed as zero.
 */
export function tallyFinishes(cards: { finishes: string[] }[]): FinishTally[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const finish of card.finishes) counts.set(finish, (counts.get(finish) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => {
      // Unknown finishes sort after the known ones, then alphabetically, so the
      // order stays deterministic if a new finish shows up before it's labelled.
      const ia = FINISH_ORDER.indexOf(a);
      const ib = FINISH_ORDER.indexOf(b);
      return (ia === -1 ? FINISH_ORDER.length : ia) - (ib === -1 ? FINISH_ORDER.length : ib) || a.localeCompare(b);
    })
    .map(([finish, count]) => ({ finish, label: FINISH_LABELS[finish] ?? finish, count }));
}
