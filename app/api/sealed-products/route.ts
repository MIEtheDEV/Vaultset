import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { searchJustTcgSealed } from "@/lib/search/justTcgSearch";

/**
 * Search JustTCG for sealed products (ETBs, booster boxes, bundles, …) so the
 * add-product flow can attach a real TCGplayer product id + current sealed
 * market price. Auth-gated: a live JustTCG call spends the shared quota, so it
 * mirrors /api/pokemon-cards in requiring an account.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: [] }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ data: [] });

  const data = await searchJustTcgSealed(q);
  return NextResponse.json({ data });
}
