import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getSearchProvider } from "@/lib/search";
import { searchJustTcg } from "@/lib/search/justTcgSearch";
import { normalizeCardNumber } from "@/lib/search/cardNumber";

// Dedup key so a card found in both sources isn't shown twice. JustTCG and
// pokemontcg.io disagree on set names, so we key on name + collector number.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const dedupKey = (name: string, number: string) =>
  `${norm(name)}|${normalizeCardNumber(number)}`;

export async function GET(request: Request) {
  // Card search spends the JustTCG/pokemontcg.io budget, so require an
  // authenticated user — this endpoint is only reached from logged-in flows
  // (inventory add, collection creator).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const raw    = searchParams.get("q")?.trim() ?? "";
  const set    = searchParams.get("set")?.trim()    || undefined;
  const number = searchParams.get("number")?.trim() || undefined;

  const promoRequested = /\bpromo\b/i.test(raw);
  const nameQuery      = raw.replace(/\bpromo\b/gi, "").trim();

  if (nameQuery.length < 2) {
    return NextResponse.json({ data: [] });
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
