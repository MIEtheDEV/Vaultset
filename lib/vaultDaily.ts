// Day-over-day movement for a user's vault: the portfolio-level delta plus the
// individual cards that moved most.
//
// The per-item change logic here was lifted verbatim out of `app/inventory/page.tsx`,
// which already computed exactly this to drive its per-card `DailyChange` ticker.
// The dashboard needs the same numbers, so rather than keep a second copy the
// logic now lives in one pure, testable place and both callers share it.
//
// Source precedence (unchanged from the inventory implementation):
//   1. The provider's real 24h move (JustTCG `priceChange24hr`, off `card_prices.raw`),
//      so a freshly-added card shows a real ticker immediately.
//   2. Our own `price_history` snapshot diff (written daily at 02:00 UTC).
//   3. Nothing — the item is excluded rather than reported as flat, because "no
//      data" and "did not move" are different claims.

import type { SupabaseClient } from "@supabase/supabase-js";
import { apiDailyChange, utcToday, type Change } from "@/lib/priceHistory";
import { extractApiCardHistory } from "@/lib/pricing/cardHistory";
import { priceApiId } from "@/lib/pricing/cardIdentity";

/** How far back to look for a prior snapshot to diff against. */
const SNAPSHOT_WINDOW_DAYS = 30;

export type VaultCard = {
  id: string;
  name: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  game_data: Record<string, unknown> | null;
};

/** The subset of a `collection_items` row this module needs. */
export type VaultItem = {
  id: string;
  market_price: number | null;
  quantity: number | null;
  finish: string | null;
  condition: string | null;
  grader: string | null;
  /** Supabase returns embedded relations as an object or a single-element array. */
  cards: VaultCard | VaultCard[] | null;
};

export type Mover = {
  itemId: string;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  /** Current market price for one copy. */
  price: number;
  quantity: number;
  change: Change;
};

export type VaultPulse = {
  /** Quantity-weighted value of the items considered here (singles only). */
  singlesValue: number;
  /** Quantity-weighted absolute move across items with a known change. */
  changeAbs: number;
  /**
   * `changeAbs` as a percentage of those same items' prior value. Null when no
   * item had a computable change, or the baseline works out to zero.
   */
  changePct: number | null;
  /** How many items contributed to the delta, and how many exist in total. */
  covered: number;
  total: number;
  movers: { up: Mover[]; down: Mover[] };
};

export function unwrapCard(cards: VaultCard | VaultCard[] | null): VaultCard | null {
  return Array.isArray(cards) ? (cards[0] ?? null) : cards;
}

/**
 * Per-item day-over-day change, keyed by `collection_items.id`.
 *
 * `prevValueByItemId` holds each item's most recent snapshot strictly before
 * today; `rawByApiId` holds `card_prices.raw` keyed by the pricing identity.
 * Items with no usable signal are simply absent from the result.
 */
export function computeDailyChanges(
  items: VaultItem[],
  prevValueByItemId: Map<string, number>,
  rawByApiId: Map<string, unknown>,
): Record<string, Change> {
  const changes: Record<string, Change> = {};

  for (const it of items) {
    if (it.market_price == null) continue;

    const card = unwrapCard(it.cards);
    const gameData = (card?.game_data ?? {}) as Record<string, unknown>;
    const apiId = card ? priceApiId(gameData, card.id) : null;

    const api = apiId
      ? extractApiCardHistory(rawByApiId.get(apiId), {
          finish: it.finish,
          edition: (gameData.edition as string) ?? null,
          condition: it.condition,
          grader: it.grader,
        })
      : null;

    let change = apiDailyChange(api?.change24hrPct, it.market_price);

    if (!change) {
      const prev = prevValueByItemId.get(it.id);
      if (prev != null && prev !== 0) {
        const abs = it.market_price - prev;
        change = { abs, pct: (abs / prev) * 100 };
      }
    }

    if (change) changes[it.id] = change;
  }

  return changes;
}

/**
 * Roll per-item changes up into the headline figures and the mover lists.
 *
 * The percentage is taken against the prior value of *only* the items that had a
 * computable change, so it stays consistent with `changeAbs` instead of being
 * diluted by items we have no data for.
 *
 * Movers are ranked by absolute dollar move rather than percent: a 40% jump on a
 * $0.30 common is noise, and surfacing it over a $30 move on a chase card would
 * make the widget feel broken.
 */
export function computeVaultPulse(
  items: VaultItem[],
  changes: Record<string, Change>,
  { moverLimit = 3, minMove = 0.01 }: { moverLimit?: number; minMove?: number } = {},
): VaultPulse {
  let singlesValue = 0;
  let changeAbs = 0;
  let baseline = 0;
  let covered = 0;
  const movers: Mover[] = [];

  for (const it of items) {
    const qty = it.quantity ?? 1;
    const price = it.market_price;
    if (price != null) singlesValue += price * qty;

    const change = changes[it.id];
    if (!change || price == null) continue;

    covered += 1;
    changeAbs += change.abs * qty;
    baseline += (price - change.abs) * qty;

    if (Math.abs(change.abs) >= minMove) {
      const card = unwrapCard(it.cards);
      movers.push({
        itemId: it.id,
        name: card?.name ?? "Unknown card",
        setName: card?.set_name ?? null,
        cardNumber: card?.card_number ?? null,
        imageUrl: card?.image_url ?? null,
        price,
        quantity: qty,
        change,
      });
    }
  }

  // Rank by the quantity-weighted dollar move — holding four copies of a card
  // that moved $2 matters more to the portfolio than one copy that moved $5.
  const byWeightedMove = (a: Mover, b: Mover) =>
    Math.abs(b.change.abs * b.quantity) - Math.abs(a.change.abs * a.quantity);

  return {
    singlesValue: round2(singlesValue),
    changeAbs: round2(changeAbs),
    changePct: baseline > 0 ? (changeAbs / baseline) * 100 : null,
    covered,
    total: items.length,
    movers: {
      up: movers.filter((m) => m.change.abs > 0).sort(byWeightedMove).slice(0, moverLimit),
      down: movers.filter((m) => m.change.abs < 0).sort(byWeightedMove).slice(0, moverLimit),
    },
  };
}

/** The portfolio delta as a `Change`, for handing straight to `<DailyChange/>`. */
export function pulseChange(pulse: VaultPulse): Change | null {
  if (pulse.covered === 0 || pulse.changePct == null) return null;
  return { abs: pulse.changeAbs, pct: pulse.changePct };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SnapshotRow = {
  collection_item_id: string;
  market_price: number | string | null;
  snapshotted_at: string;
};

/**
 * Each item's most recent snapshot *strictly before* today, from rows in any order.
 *
 * Today's row is excluded deliberately: once the 02:00 UTC cron has written it,
 * diffing against it would compare today with itself and report no movement.
 */
export function prevValueFromSnapshots(
  rows: SnapshotRow[],
  today: string = utcToday(),
): Map<string, number> {
  const bestDate = new Map<string, string>();
  const value = new Map<string, number>();

  for (const r of rows) {
    if (!r.collection_item_id || r.snapshotted_at >= today) continue;
    if (r.market_price == null) continue;
    const seen = bestDate.get(r.collection_item_id);
    if (seen == null || r.snapshotted_at > seen) {
      bestDate.set(r.collection_item_id, r.snapshotted_at);
      value.set(r.collection_item_id, Number(r.market_price));
    }
  }

  return value;
}

/**
 * Fetch the two inputs `computeDailyChanges` needs and apply it.
 *
 * Bounded on purpose: snapshots are limited to the last 30 days, and only the
 * `card_prices` rows for cards actually in `items` are read.
 *
 * Pass `snapshots` when the caller has already loaded `price_history` for another
 * purpose (the dashboard loads it for the portfolio chart) — that skips the
 * snapshot query entirely rather than scanning the same table twice.
 */
export async function loadDailyChanges(
  supabase: SupabaseClient,
  userId: string,
  items: VaultItem[],
  { snapshots }: { snapshots?: SnapshotRow[] } = {},
): Promise<Record<string, Change>> {
  if (items.length === 0) return {};

  let prevValue: Map<string, number>;
  if (snapshots) {
    prevValue = prevValueFromSnapshots(snapshots);
  } else {
    const windowStart = new Date(Date.now() - SNAPSHOT_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const { data: histRows } = await supabase
      .from("price_history")
      .select("collection_item_id, market_price, snapshotted_at")
      .eq("user_id", userId)
      .lt("snapshotted_at", utcToday())
      .gte("snapshotted_at", windowStart)
      .order("snapshotted_at", { ascending: false });

    prevValue = prevValueFromSnapshots((histRows ?? []) as SnapshotRow[]);
  }

  const apiIds = new Set<string>();
  for (const it of items) {
    const card = unwrapCard(it.cards);
    const id = card ? priceApiId((card.game_data ?? {}) as Record<string, unknown>, card.id) : null;
    if (id) apiIds.add(id);
  }

  const { data: priceRows } = apiIds.size
    ? await supabase.from("card_prices").select("card_api_id, raw").in("card_api_id", [...apiIds])
    : { data: [] as { card_api_id: string; raw: unknown }[] };

  const rawByApiId = new Map<string, unknown>();
  for (const row of (priceRows ?? []) as { card_api_id: string; raw: unknown }[]) {
    rawByApiId.set(row.card_api_id, row.raw);
  }

  return computeDailyChanges(items, prevValue, rawByApiId);
}
