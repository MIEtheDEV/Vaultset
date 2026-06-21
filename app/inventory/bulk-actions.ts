"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { PriceFetchEngine } from "@/lib/pricing/PriceFetchEngine";
import { propagateMarketValues } from "@/lib/pricing/propagateMarketValues";
import { ensureGradedPrices } from "@/lib/pricing/gradedPrices";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import type { CardRef } from "@/lib/pricing/PriceProvider";
import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

export async function bulkSetForSale(itemIds: string[], value: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("collection_items")
    .update({ for_sale: value })
    .in("id", itemIds)
    .eq("user_id", user.id)
    .eq("on_hold", false);

  revalidatePath("/inventory");
}

export async function bulkSetForTrade(itemIds: string[], value: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("collection_items")
    .update({ for_trade: value })
    .in("id", itemIds)
    .eq("user_id", user.id)
    .eq("on_hold", false);

  revalidatePath("/inventory");
}

/**
 * Refresh a single inventory item's tracked market value (market_price) through
 * the cascading pricing engine, then persist it. Does NOT touch list_price —
 * market value and listing price are kept separate. Returns the new value.
 */
export async function refreshItemMarketValue(itemId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: item } = await supabase
    .from("collection_items")
    .select("id, finish, condition, grader, grade, cards ( id, name, set_name, set_code, card_number, game_data )")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .single();
  if (!item) throw new Error("Item not found");

  const card  = Array.isArray(item.cards) ? item.cards[0] : item.cards;
  const gd    = ((card as any)?.game_data ?? {}) as Record<string, unknown>;
  const apiId = priceApiId(gd, (card as any)?.id);
  if (!apiId) return null;

  const ref: CardRef = {
    apiId,
    tcgplayerId: (gd.tcgplayer_id as string) ?? null,
    name:    (card as any)?.name        ?? undefined,
    setName: (card as any)?.set_name    ?? undefined,
    setCode: (card as any)?.set_code    ?? undefined,
    number:  (card as any)?.card_number ?? undefined,
  };

  const admin    = createAdminClient();
  const engine   = new PriceFetchEngine(admin);
  const priced   = await engine.getPrices([ref], { allowResolve: true });
  const resolved = priced.get(apiId);
  if (!resolved) return null;

  const isGraded = !!(item as any).grader && (item as any).grade != null;
  const gradedPrices = isGraded ? await ensureGradedPrices(admin, apiId) : null;

  const provider = new PokemonTCGProvider();
  const price = provider.getMarketPrice(
    { prices: resolved.prices } as TcgPlayerData,
    (item as any).finish ?? null,
    (gd.edition as string) ?? null,
    (item as any).condition ?? null,
    (item as any).grader ?? null,
    (item as any).grade ?? null,
    resolved.conditionPrices,
    gradedPrices,
  );
  if (price == null) return null;

  await supabase
    .from("collection_items")
    .update({ market_price: price })
    .eq("id", itemId)
    .eq("user_id", user.id);

  // If this was a fresh fetch, propagate the new value to all other holders.
  if (!resolved.fromCache) await propagateMarketValues(admin, [apiId]);

  revalidatePath("/inventory");
  return price;
}

/**
 * Set the listing price equal to the tracked market value for every item the
 * user currently has FOR SALE (skipping on-hold and items without a market
 * value). The per-card "List at Market" button stays the individual path; this
 * is the bulk equivalent. Returns how many listings were updated.
 */
export async function bulkMatchMarket(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: rows } = await supabase
    .from("collection_items")
    .select("id, market_price")
    .eq("user_id", user.id)
    .eq("for_sale", true)
    .eq("on_hold", false)
    .not("market_price", "is", null);

  const updates = rows ?? [];
  await Promise.all(
    updates.map((r) =>
      supabase
        .from("collection_items")
        .update({ list_price: r.market_price })
        .eq("id", r.id)
        .eq("user_id", user.id),
    ),
  );

  revalidatePath("/inventory");
  return updates.length;
}

export async function bulkDelete(itemIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("collection_items")
    .delete()
    .in("id", itemIds)
    .eq("user_id", user.id)
    .eq("on_hold", false)
    .is("transfer_status", null);

  revalidatePath("/inventory");
}
