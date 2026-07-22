import type { SupabaseClient } from "@supabase/supabase-js";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { PriceFetchEngine } from "./PriceFetchEngine";
import type { CardRef } from "./PriceProvider";

/**
 * Sealed products are priced through the SAME cache-first engine as singles:
 * each product is keyed `tcg:<tcgplayerId>` (a synthetic id bedrock skips, so it
 * cascades straight to JustTCG's batch-by-tcgplayerId path — no per-product
 * resolve, no wasted quota). JustTCG returns one "Sealed"/"Normal" variant,
 * which variantsToPrices maps onto the `normal` finish; we read that market
 * value directly (no finish/condition/grade multipliers apply to a sealed box).
 */

/** Pull the sealed market value out of an engine-resolved price payload. */
export function sealedMarketFromPrices(prices?: TcgPlayerData["prices"] | null): number | null {
  if (!prices) return null;
  if (prices.normal?.market != null) return prices.normal.market;
  // Belt-and-suspenders: take the first finish that carries a market price.
  for (const p of Object.values(prices)) if (p?.market != null) return p.market;
  return null;
}

/**
 * Refresh cached sealed market values for every product this user owns that has
 * a mapped TCGplayer id. Prices flow through the shared engine + cache, then the
 * fresh value is fanned out to ALL holders of the same product (parity with
 * singles' propagateMarketValues — one Pro refresh updates everyone's copy, and
 * the shared card_prices cache means the next refresh is a cheap hit).
 *
 * Backend-only: pass the service-role (admin) client. Returns the number of
 * product rows updated (across all users).
 */
export async function refreshSealedProductPrices(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  // Opened products are excluded: a cracked box's worth is its pulled singles
  // (tracked separately), so a sealed market value on it would be false.
  const { data: products } = await admin
    .from("product_purchases")
    .select("id, tcgplayer_id")
    .eq("user_id", userId)
    .not("tcgplayer_id", "is", null)
    .neq("status", "opened");

  if (!products || products.length === 0) return 0;

  // Dedupe to one CardRef per TCGplayer id (a user can own several of the same box).
  const tcgIdByApiId = new Map<string, string>();
  const refs: CardRef[] = [];
  for (const p of products) {
    const tcgId = p.tcgplayer_id as string;
    const apiId = `tcg:${tcgId}`;
    if (tcgIdByApiId.has(apiId)) continue;
    tcgIdByApiId.set(apiId, tcgId);
    refs.push({ apiId, tcgplayerId: tcgId });
  }

  const engine = new PriceFetchEngine(admin);
  const priced = await engine.getPricesGapAware(refs);

  const now = new Date().toISOString();
  const valueByTcgId = new Map<string, number>();
  for (const [apiId, tcgId] of tcgIdByApiId) {
    const mv = sealedMarketFromPrices(priced.get(apiId)?.prices);
    if (mv != null) valueByTcgId.set(tcgId, mv);
  }
  if (valueByTcgId.size === 0) return 0;

  // Fan out to every (still-sealed) holder of each product — market value is
  // objective. Opened holders are skipped so we never stamp them a false value.
  const results = await Promise.all(
    [...valueByTcgId].map(([tcgId, mv]) =>
      admin
        .from("product_purchases")
        .update({ market_value: mv, market_value_updated_at: now })
        .eq("tcgplayer_id", tcgId)
        .neq("status", "opened")
        .select("id"),
    ),
  );

  return results.reduce((sum, r) => sum + (r.data?.length ?? 0), 0);
}
