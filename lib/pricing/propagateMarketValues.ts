import type { SupabaseClient } from "@supabase/supabase-js";
import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { priceApiId } from "./cardIdentity";

const provider = new PokemonTCGProvider();

/**
 * Fan a freshly-updated card price out to EVERY holder's collection_items row
 * (across all users), recomputing each row's market value with its own
 * finish/edition/condition/grade via the shared getMarketPrice() logic.
 *
 * Only `market_price` is written — `list_price` is never touched, so each user
 * keeps full autonomy over their listing prices.
 *
 * Requires a service-role (admin) client (cross-user writes bypass RLS).
 * Call it only with cards whose price was *freshly fetched* (ResolvedPrice
 * .fromCache === false), so cache-hit refreshes don't trigger needless fan-out.
 * Returns the number of rows updated.
 */
export async function propagateMarketValues(
  admin: SupabaseClient,
  cardApiIds: string[],
): Promise<number> {
  const ids = [...new Set(cardApiIds)];
  if (ids.length === 0) return 0;

  // 1. Latest cached prices for these cards.
  const { data: priceRows } = await admin
    .from("card_prices")
    .select("card_api_id, prices, condition_prices")
    .in("card_api_id", ids);

  const pricesByApiId = new Map<string, { prices: TcgPlayerData["prices"]; conditionPrices: Record<string, Record<string, number>> | null }>();
  for (const row of priceRows ?? []) {
    pricesByApiId.set(row.card_api_id, { prices: row.prices, conditionPrices: row.condition_prices ?? null });
  }
  if (pricesByApiId.size === 0) return 0;

  // 2. Find every `cards` row for these ids. The add flow inserts a new cards
  //    row per add, so one id maps to many card_id UUIDs. Ids come in two forms:
  //    pokemontcg.io ids (matched on game_data.pokemon_api_id) and synthesized
  //    "tcg:<productId>" ids (matched on game_data.tcgplayer_id).
  const tcgIds     = ids.filter((id) => id.startsWith("tcg:")).map((id) => id.slice(4));
  const manualIds  = ids.filter((id) => id.startsWith("manual:")).map((id) => id.slice(7));
  const pokemonIds = ids.filter((id) => !id.startsWith("tcg:") && !id.startsWith("manual:"));

  const cardRows: { id: string; game_data: Record<string, unknown> }[] = [];
  const fetchCards = async (col: string, values: string[]) => {
    if (values.length === 0) return;
    const { data } = await admin.from("cards").select("id, game_data").in(col, values);
    cardRows.push(...((data ?? []) as any));
  };
  await fetchCards("game_data->>pokemon_api_id", pokemonIds);
  await fetchCards("game_data->>tcgplayer_id", tcgIds);
  await fetchCards("id", manualIds); // manual:<cardId> → the cards row UUID itself

  // card_id -> { apiId, edition } (edition is per-card, shared across holders).
  const cardMeta = new Map<string, { apiId: string; edition: string | null }>();
  for (const row of cardRows) {
    const gd = (row.game_data ?? {}) as Record<string, unknown>;
    const apiId = priceApiId(gd, row.id);
    if (!apiId || !pricesByApiId.has(apiId)) continue;
    cardMeta.set(row.id, { apiId, edition: (gd.edition as string) ?? null });
  }
  if (cardMeta.size === 0) return 0;

  // Cached graded prices for these cards, so graded holders keep their slab
  // value during fan-out instead of being recomputed with the grade multiplier.
  const gradedByApiId = new Map<string, Record<string, Record<string, number>>>();
  const { data: gradedRows } = await admin
    .from("card_graded_prices")
    .select("card_api_id, graded")
    .in("card_api_id", [...pricesByApiId.keys()]);
  for (const g of gradedRows ?? []) gradedByApiId.set(g.card_api_id, g.graded);

  // 3. All holders' items referencing those cards (every user).
  const { data: items } = await admin
    .from("collection_items")
    .select("id, card_id, finish, condition, grader, grade")
    .in("card_id", [...cardMeta.keys()]);

  // 4. Recompute market_price per item from its own attributes.
  const updates: { id: string; market_price: number }[] = [];
  for (const item of items ?? []) {
    const meta = cardMeta.get((item as any).card_id);
    if (!meta) continue;
    const cached = pricesByApiId.get(meta.apiId);
    if (!cached) continue;

    const price = provider.getMarketPrice(
      { prices: cached.prices } as TcgPlayerData,
      (item as any).finish ?? null,
      meta.edition,
      (item as any).condition ?? null,
      (item as any).grader ?? null,
      (item as any).grade ?? null,
      cached.conditionPrices,
      gradedByApiId.get(meta.apiId) ?? null,
    );
    if (price != null) updates.push({ id: (item as any).id, market_price: price });
  }

  // 5. Apply in batches to avoid an unbounded parallel write burst.
  let updated = 0;
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    const results = await Promise.all(
      chunk.map((u) =>
        admin.from("collection_items").update({ market_price: u.market_price }).eq("id", u.id),
      ),
    );
    updated += results.filter((r) => !r.error).length;
  }
  return updated;
}
