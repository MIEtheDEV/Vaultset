import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSearchProvider, type SearchResult } from "@/lib/search";
import { searchJustTcg } from "@/lib/search/justTcgSearch";
import { normalizeCardNumber } from "@/lib/search/cardNumber";
import { priceApiId } from "@/lib/pricing/cardIdentity";

// Dedup key so a card found in both sources isn't shown twice. JustTCG and
// pokemontcg.io disagree on set names, so we key on name + collector number.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const dedupKey = (name: string, number: string) =>
  `${norm(name)}|${normalizeCardNumber(number)}`;

/**
 * Search only the cards already in our catalog — no external API calls, so it's
 * free to run for logged-out visitors. Deduped by catalog price id so results
 * link straight to /card-data/<id>.
 */
async function searchLocalCards(name: string): Promise<SearchResult[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cards")
    .select("id, name, card_number, set_name, set_code, image_url, game_data")
    .ilike("name", `%${name}%`)
    .limit(120);

  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const row of data ?? []) {
    const gd = (row.game_data ?? {}) as Record<string, unknown>;
    const apiId = priceApiId(gd, row.id);
    if (!apiId || seen.has(apiId)) continue;
    seen.add(apiId);
    out.push({
      id:     apiId,
      name:   row.name,
      number: (row.card_number as string) ?? "",
      rarity: gd.rarity as string | undefined,
      set:    { id: (row.set_code as string) ?? "", name: (row.set_name as string) ?? "" },
      images: { small: (row.image_url as string) ?? "", large: (row.image_url as string) ?? "" },
    });
    if (out.length >= 50) break;
  }
  return out;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { searchParams } = new URL(request.url);
  const raw    = searchParams.get("q")?.trim() ?? "";
  const set    = searchParams.get("set")?.trim()    || undefined;
  const number = searchParams.get("number")?.trim() || undefined;

  const promoRequested = /\bpromo\b/i.test(raw);
  const nameQuery      = raw.replace(/\bpromo\b/gi, "").trim();

  if (nameQuery.length < 2) {
    return NextResponse.json({ data: [] });
  }

  // Logged-out visitors can search cards already in our catalog (a free local
  // lookup). The live pokemontcg.io/JustTCG search spends budget, so surfacing
  // not-yet-added cards requires an account.
  if (!user) {
    return NextResponse.json({ data: await searchLocalCards(nameQuery) });
  }

  // Polymorphic: swapping the game string here switches the entire
  // search implementation without touching any other code.
  const provider = getSearchProvider("pokemon");

  // pokemontcg.io is the primary catalog (richer data, set ids). JustTCG fills
  // the gaps (promos, brand-new cards) — its results are appended for any card
  // not already returned by pokemontcg.io.
  const primary = await provider.search(nameQuery, { set, number, promoRequested });

  // JustTCG search calls bypass the engine's daily budget guard, so only spend
  // one when it's likely to add value: a number is given (pinpoints promos JustTCG
  // can return) or pokemontcg.io came back thin (rare/new card). Otherwise the
  // primary results are plenty and we skip the call to protect the 100/day quota.
  const justtcg = (number || primary.length < 5)
    ? await searchJustTcg(nameQuery, number)
    : [];

  const seen = new Set(primary.map((c) => dedupKey(c.name, c.number)));
  const extra = justtcg.filter((c) => {
    if (number && normalizeCardNumber(c.number) !== normalizeCardNumber(number)) return false;
    const k = dedupKey(c.name, c.number);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return NextResponse.json({ data: [...primary, ...extra] });
}
