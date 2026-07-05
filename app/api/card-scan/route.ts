import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isUserAdmin } from "@/lib/auth/admin";
import { scanSearchPokemon, type ScanCandidate } from "@/lib/search/PokemonTCGProvider";
import type { SearchResult } from "@/lib/search/CardSearchProvider";
import { extractNameCandidates, rankCandidates, resolveScan } from "@/lib/scan/fingerprint";

// Card scanner (admin-only, beta). The browser OCRs the card's body text and
// POSTs it here; we fingerprint-match it to the card DB and return candidate
// printings. Free Tier-1 identity path — no paid API. See docs/card-scanning-research.md.

/** GET → { enabled }: whether the caller may use the scanner (admin gate for the UI). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const enabled = user ? await isUserAdmin(user.id) : false;
  return NextResponse.json({ enabled });
}

/** POST { text, lines } → { candidates, confident }. Authoritative admin gate. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isUserAdmin(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { text?: string; lines?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const lines = Array.isArray(body.lines) ? body.lines.filter((l) => typeof l === "string") : [];
  if (text.length < 3) {
    return NextResponse.json({ candidates: [], confident: false });
  }

  const nameCandidates = extractNameCandidates(text, lines.length ? lines : text.split("\n"));
  if (nameCandidates.length === 0) {
    return NextResponse.json({ candidates: [], confident: false });
  }

  const pool = await scanSearchPokemon(nameCandidates);
  const ranked = rankCandidates(pool, text);
  const { candidates, confident } = resolveScan(ranked, 8);

  // Return the SearchResult shape the add form's handlePokemonSelect expects
  // (drop the attacks/hp we only needed for ranking).
  const out: SearchResult[] = candidates.map((c: ScanCandidate) => ({
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    subtypes: c.subtypes,
    set: c.set,
    images: c.images,
    tcgplayer: c.tcgplayer ?? null,
  }));

  return NextResponse.json({ candidates: out, confident });
}
