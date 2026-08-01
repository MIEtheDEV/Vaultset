// Day-over-day movement for a user's vault: the portfolio-level delta plus the
// individual cards that moved most.
//
// The per-item change logic here was lifted verbatim out of `app/inventory/page.tsx`,
// which already computed exactly this to drive its per-card `DailyChange` ticker.
// The dashboard needs the same numbers, so rather than keep a second copy the
// logic now lives in one pure, testable place and both callers share it.
//
// Source precedence:
//   1. Our own `price_history` snapshot diff (written daily at 02:00 UTC). This is
//      the series the value chart draws, so the ticker and the chart always agree.
//   2. The provider's 24h move (JustTCG `priceChange24hr`, off `card_prices.raw`) —
//      only for an item with no snapshot yet (freshly added), and only from a
//      payload written in the last `API_CHANGE_MAX_AGE_MS`.
//   3. Nothing — the item is excluded rather than reported as flat, because "no
//      data" and "did not move" are different claims.
//
// The provider path used to win outright and carried no freshness check, which made
// a stale `card_prices` row report the same phantom move every single day.
// `priceChange24hr` measures the 24h *before `card_prices.updated_at`*, not the 24h
// before now; nothing refreshes that row on a schedule, so once it goes cold its
// percentage is a constant. Applied to an equally constant `market_price` it yielded
// a fixed dollar figure that the daily digest re-reported forever. (Observed: a
// 6-day-old −12.36% on a $7.73 × 2 holding pushed "down $2.18, led by Ampharos" six
// days running, while `price_history` showed one real −$1.84 move and flat after.)

import type { SupabaseClient } from "@supabase/supabase-js";
import { apiDailyChange, type Change } from "@/lib/priceHistory";
import { extractApiCardHistory } from "@/lib/pricing/cardHistory";
import { priceApiId } from "@/lib/pricing/cardIdentity";

/** How far back to look for a prior snapshot to diff against. */
const SNAPSHOT_WINDOW_DAYS = 30;

/**
 * How recent a `card_prices` row must be for its `priceChange24hr` to describe a
 * window that overlaps today. Older than this and the percentage is a frozen
 * historical figure, not a move that happened since yesterday.
 */
const API_CHANGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A `card_prices` row, with the timestamp needed to judge its 24h figure. */
export type CachedPrice = { raw: unknown; updatedAt: string | null };

function isFresh(updatedAt: string | null, now: number): boolean {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  return Number.isFinite(t) && now - t <= API_CHANGE_MAX_AGE_MS;
}

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
 * today; `priceByApiId` holds `card_prices` rows keyed by the pricing identity.
 * Items with no usable signal are simply absent from the result.
 */
export function computeDailyChanges(
  items: VaultItem[],
  prevValueByItemId: Map<string, number>,
  priceByApiId: Map<string, CachedPrice>,
  now: number = Date.now(),
): Record<string, Change> {
  const changes: Record<string, Change> = {};

  for (const it of items) {
    if (it.market_price == null) continue;

    let change: Change | null = null;

    const prev = prevValueByItemId.get(it.id);
    if (prev != null && prev !== 0) {
      const abs = it.market_price - prev;
      change = { abs, pct: (abs / prev) * 100 };
    }

    // No snapshot to diff against — a card added since the last 02:00 UTC run.
    // The provider's 24h figure gives it a real ticker on day one, but only while
    // the payload it came from is recent enough to be talking about today.
    if (!change) {
      const card = unwrapCard(it.cards);
      const gameData = (card?.game_data ?? {}) as Record<string, unknown>;
      const apiId = card ? priceApiId(gameData, card.id) : null;
      const cached = apiId ? priceByApiId.get(apiId) : undefined;

      if (cached && isFresh(cached.updatedAt, now)) {
        const api = extractApiCardHistory(cached.raw, {
          finish: it.finish,
          edition: (gameData.edition as string) ?? null,
          condition: it.condition,
          grader: it.grader,
        });
        change = apiDailyChange(api?.change24hrPct, it.market_price);
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

/*
 * `prevValueFromSnapshots` / `SnapshotRow` lived here until the prior-day lookup
 * moved into the `latest_prior_snapshots` RPC. Picking the newest row per item is
 * now `distinct on` in SQL, which is both cheaper and immune to the row cap that
 * the JS version silently suffered from.
 */

/**
 * Fetch the two inputs `computeDailyChanges` needs and apply it.
 *
 * Bounded on purpose: prior snapshots are limited to the last 30 days, and only
 * the `card_prices` rows for cards actually in `items` are read.
 *
 * The prior values come from the `latest_prior_snapshots` RPC rather than a raw
 * `price_history` select. The old select pulled up to 30 days × every held item
 * and leaned on descending order to keep the newest rows inside PostgREST's
 * 1000-row cap — which quietly stopped holding for larger collections, dropping
 * items out of the ticker entirely. `distinct on` returns exactly one row per
 * item, so the cap is unreachable. (The same truncation, on the ascending query
 * that fed the portfolio chart, is what made the 7D window come back empty.)
 */
export async function loadDailyChanges(
  supabase: SupabaseClient,
  userId: string,
  items: VaultItem[],
): Promise<Record<string, Change>> {
  if (items.length === 0) return {};

  const { data: priorRows } = await supabase.rpc("latest_prior_snapshots", {
    p_user_id: userId,
    p_window_days: SNAPSHOT_WINDOW_DAYS,
  });

  const prevValue = new Map<string, number>();
  for (const row of (priorRows ?? []) as {
    collection_item_id: string;
    market_price: number | string | null;
  }[]) {
    if (row.market_price != null) {
      prevValue.set(row.collection_item_id, Number(row.market_price));
    }
  }

  const apiIds = new Set<string>();
  for (const it of items) {
    const card = unwrapCard(it.cards);
    const id = card ? priceApiId((card.game_data ?? {}) as Record<string, unknown>, card.id) : null;
    if (id) apiIds.add(id);
  }

  // `updated_at` is not decoration: it's the only thing that says whether the
  // row's `priceChange24hr` describes today or some frozen day in the past.
  type PriceRow = { card_api_id: string; raw: unknown; updated_at: string | null };
  const { data: priceRows } = apiIds.size
    ? await supabase
        .from("card_prices")
        .select("card_api_id, raw, updated_at")
        .in("card_api_id", [...apiIds])
    : { data: [] as PriceRow[] };

  const priceByApiId = new Map<string, CachedPrice>();
  for (const row of (priceRows ?? []) as PriceRow[]) {
    priceByApiId.set(row.card_api_id, { raw: row.raw, updatedAt: row.updated_at });
  }

  return computeDailyChanges(items, prevValue, priceByApiId);
}
