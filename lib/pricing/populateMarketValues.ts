import type { SupabaseClient } from "@supabase/supabase-js";
import { PriceFetchEngine } from "./PriceFetchEngine";
import { propagateMarketValues } from "./propagateMarketValues";
import type { CardRef } from "./PriceProvider";

/**
 * Populate `market_price` for cards that lack one (freshly added, imported, or
 * backfilled). **Bedrock-first** (`allowResolve: false`) so it never spends the
 * limited JustTCG daily quota — pokemontcg.io gives universal baseline coverage;
 * JustTCG / per-condition enrichment happens later on the card detail view
 * (`/api/card-price`) or a Pro refresh.
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
  await engine.getPrices(refs, { allowResolve: false });
  const apiIds = [...new Set(refs.map((r) => r.apiId))];
  return propagateMarketValues(admin, apiIds);
}
