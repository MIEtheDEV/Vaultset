import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { populateMarketValues } from "@/lib/pricing/populateMarketValues";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import type { CardRef } from "@/lib/pricing/PriceProvider";

/**
 * Backfill `market_price` for the caller's inventory items that have none —
 * cards added before fetch-on-add existed, or via CSV import (which doesn't
 * price). Gap-aware: bedrock covers everything it can for free, then JustTCG
 * resolves the cards bedrock lacks (e.g. brand-new sets), bounded by the daily
 * JustTCG budget guard. Scoped to the caller's own items; open to any
 * authenticated user (free baseline coverage).
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: items } = await supabase
    .from("collection_items")
    .select("id, cards ( id, name, set_name, set_code, card_number, game_data )")
    .eq("user_id", user.id)
    .is("market_price", null)
    .is("transfer_status", null);

  type CardRow = {
    id: string;
    name: string | null;
    set_name: string | null;
    set_code: string | null;
    card_number: string | null;
    game_data: Record<string, unknown> | null;
  };

  // Distinct cards to price (one fetch warms the cache for every holder).
  const refs = new Map<string, CardRef>();
  for (const item of items ?? []) {
    const card = (Array.isArray(item.cards) ? item.cards[0] : item.cards) as CardRow | null;
    const gd   = (card?.game_data ?? {}) as Record<string, unknown>;
    const apiId = priceApiId(gd, card?.id);
    if (!apiId || refs.has(apiId)) continue;
    refs.set(apiId, {
      apiId,
      tcgplayerId: (gd.tcgplayer_id as string) ?? null,
      name:    card?.name        ?? undefined,
      setName: card?.set_name    ?? undefined,
      setCode: card?.set_code    ?? undefined,
      number:  card?.card_number ?? undefined,
    });
  }

  const admin = createAdminClient();
  const updated = await populateMarketValues(admin, [...refs.values()]);
  return NextResponse.json({ scanned: items?.length ?? 0, updated });
}
