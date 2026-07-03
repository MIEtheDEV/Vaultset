import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { PriceFetchEngine } from "@/lib/pricing/PriceFetchEngine";
import { propagateMarketValues } from "@/lib/pricing/propagateMarketValues";
import type { CardRef } from "@/lib/pricing/PriceProvider";

/**
 * On-demand single-card price refresh, called when a card detail view is opened.
 * Resolves through the cascading engine with `allowResolve` enabled, so JustTCG
 * may spend one GET lookup to resolve + price an unmapped card (and persist its
 * tcgplayer_id). Results land in the shared card_prices cache, warming it for
 * every user. The 6h freshness check inside the engine means repeat views are
 * effectively free.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<CardRef>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.apiId) return NextResponse.json({ error: "apiId required" }, { status: 400 });

  const ref: CardRef = {
    apiId:   body.apiId,
    game:    body.game ?? "pokemon",
    name:    body.name,
    setName: body.setName,
    setCode: body.setCode,
    number:  body.number,
  };

  const admin = createAdminClient();
  const engine = new PriceFetchEngine(admin);
  const priced = await engine.getPrices([ref], { allowResolve: true });
  const resolved = priced.get(ref.apiId);

  if (!resolved) return NextResponse.json({ price: null });

  // A fresh fetch here warms the shared cache for everyone; fan the new value
  // out to all holders' stored market_price too (never their list_price).
  if (!resolved.fromCache) await propagateMarketValues(admin, [ref.apiId]);

  return NextResponse.json({
    prices:          resolved.prices,
    conditionPrices: resolved.conditionPrices,
    source:          resolved.source,
    updatedAt:       resolved.updatedAt,
    tcgplayerId:     resolved.tcgplayerId,
    tcgplayerUrl:    resolved.tcgplayerUrl,
  });
}
