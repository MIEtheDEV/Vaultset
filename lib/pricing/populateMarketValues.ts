import type { SupabaseClient } from "@supabase/supabase-js";
import { PriceFetchEngine } from "./PriceFetchEngine";
import { propagateMarketValues } from "./propagateMarketValues";
import type { CardRef } from "./PriceProvider";

/**
 * Populate `market_price` for cards that lack one (freshly added, imported, or
 * backfilled). **Gap-aware** (`getPricesGapAware`): pokemontcg.io bedrock prices
 * everything it can for free, then JustTCG resolves only the cards bedrock can't
 * cover (e.g. brand-new sets pokemontcg.io hasn't priced yet) — bounded by the
 * daily JustTCG budget guard. This is what lets a new-set card pick up a value on
 * add/backfill instead of staying blank until a manual Pro refresh.
 *
 * Warms the shared `card_prices` cache via the engine, then fans the value out
 * to every holder of those cards (including the just-added / still-null rows)
 * through `propagateMarketValues`, which recomputes each row by its own
 * finish/edition/condition/grade. Returns the number of rows updated.
 *
 * Backend-only: requires a service-role (admin) client (cross-user writes).
 */
export async function populateMarketValues(
  admin: SupabaseClient,
  refs: CardRef[],
): Promise<number> {
  if (refs.length === 0) return 0;
  const engine = new PriceFetchEngine(admin);
  await engine.getPricesGapAware(refs);
  const apiIds = [...new Set(refs.map((r) => r.apiId))];
  return propagateMarketValues(admin, apiIds);
}
