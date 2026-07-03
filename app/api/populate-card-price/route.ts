import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { populateMarketValues } from "@/lib/pricing/populateMarketValues";
import type { CardRef } from "@/lib/pricing/PriceProvider";

/**
 * Populate a freshly-added card's market value via the gap-aware engine (bedrock
 * for what it can, JustTCG for the gaps) so cards don't land in inventory with a
 * null `market_price`. Called by the add flow after insert. Open to any
 * authenticated user — initial population is free baseline coverage, distinct from
 * the Pro-gated bulk on-demand refresh.
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
  const updated = await populateMarketValues(admin, [ref]);
  return NextResponse.json({ updated });
}
