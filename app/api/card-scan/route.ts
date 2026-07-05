import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isUserAdmin } from "@/lib/auth/admin";
import { scanSearchPokemon, type ScanCandidate } from "@/lib/search/PokemonTCGProvider";
import type { SearchResult } from "@/lib/search/CardSearchProvider";
import { searchJustTcg } from "@/lib/search/justTcgSearch";
import { extractNameCandidates, rankCandidates, resolveScan } from "@/lib/scan/fingerprint";

interface TopMatch { name: string; set: string; number: string; score: number }

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

/** POST { text, lines, bytes? } → { candidates, confident, debug }. Admin gate + logs. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isUserAdmin(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { text?: string; lines?: string[]; bytes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const lines = Array.isArray(body.lines) ? body.lines.filter((l) => typeof l === "string") : [];

  // Compute the match. Every path (including "nothing read" / "no candidates")
  // falls through to logging + a single return, so failures are captured too.
  let nameCandidates: string[] = [];
  let pool: ScanCandidate[] = [];
  let top: TopMatch[] = [];
  let out: SearchResult[] = [];
  let confident = false;
  let justtcgAppended = 0;

  if (text.length >= 3) {
    nameCandidates = extractNameCandidates(text, lines.length ? lines : text.split("\n"));
    if (nameCandidates.length > 0) {
      pool = await scanSearchPokemon(nameCandidates);
      const ranked = rankCandidates(pool, text);
      top = ranked.slice(0, 6).map((r) => ({
        name: r.card.name, set: r.card.set?.name ?? "", number: r.card.number, score: r.score,
      }));
      const resolved = resolveScan(ranked, 8);
      confident = resolved.confident;
      // SearchResult shape the add form's handlePokemonSelect expects (drop attacks/hp).
      out = resolved.candidates.map((c: ScanCandidate) => ({
        id: c.id, name: c.name, number: c.number, rarity: c.rarity,
        subtypes: c.subtypes, set: c.set, images: c.images, tcgplayer: c.tcgplayer ?? null,
      }));

      // pokemontcg.io misses many promos/secret rares (Charmeleon 079 promo, etc.).
      // When the primary match is weak, fall back to JustTCG by the best name guess
      // so those cards can still surface as options (unranked — JustTCG has no attacks).
      if (!confident || out.length < 3) {
        const jt = await searchJustTcg(nameCandidates[0]);
        const seen = new Set(out.map((c) => `${c.name.toLowerCase()}|${c.number}`));
        for (const c of jt) {
          const k = `${c.name.toLowerCase()}|${c.number}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(c);
          justtcgAppended++;
          if (out.length >= 12) break;
        }
      }
    }
  }

  // Persist a diagnostics row so real-world (phone/production) failures are
  // reviewable from the DB. Best-effort: never fail a scan on a logging error.
  try {
    const admin = createAdminClient();
    await admin.from("scan_diagnostics").insert({
      user_id: user.id,
      ocr_text: text,
      ocr_char_count: text.length,
      name_candidates: nameCandidates,
      pool_size: pool.length,
      justtcg_appended: justtcgAppended,
      confident,
      top_matches: top,
      result_candidates: out.map((c) => ({ id: c.id, name: c.name, set: c.set?.name ?? "", number: c.number })),
      image_bytes: typeof body.bytes === "number" ? body.bytes : null,
      user_agent: request.headers.get("user-agent"),
    });
  } catch {
    /* logging is best-effort */
  }

  return NextResponse.json({
    candidates: out,
    confident,
    debug: { nameCandidates, poolSize: pool.length, justtcgAppended, top },
  });
}
