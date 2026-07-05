import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isUserAdmin } from "@/lib/auth/admin";
import { scanSearchPokemon, type ScanCandidate } from "@/lib/search/PokemonTCGProvider";
import type { SearchResult } from "@/lib/search/CardSearchProvider";
import { searchJustTcg } from "@/lib/search/justTcgSearch";
import { extractNameCandidates, extractAttackPhrases, extractNumber, rankCandidates, resolveScan } from "@/lib/scan/fingerprint";

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
  let number: string | null = null;
  let pool: ScanCandidate[] = [];
  let top: TopMatch[] = [];
  let out: SearchResult[] = [];
  let confident = false;
  let justtcgAppended = 0;

  if (text.length >= 3) {
    const useLines = lines.length ? lines : text.split("\n");
    nameCandidates = extractNameCandidates(text, useLines);
    const attackPhrases = extractAttackPhrases(text, useLines);
    number = extractNumber(text);
    if (nameCandidates.length > 0 || attackPhrases.length > 0) {
      pool = await scanSearchPokemon(nameCandidates, attackPhrases);
      const ranked = rankCandidates(pool, text, number);
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

      // Surface promo/secret-rare printings pokemontcg.io lacks (e.g. Charmeleon
      // 079 promo — a promo of an otherwise-known card). Run JustTCG even on
      // confident matches, keyed on the clean matched name when we have one.
      // Admin beta: JustTCG's ~100 req/day quota isn't a concern with one tester;
      // gate this (e.g. only when no promo already present) before public launch.
      const jtQuery = (confident && out[0]) ? out[0].name : nameCandidates[0];
      if (jtQuery) {
        // Pass the OCR'd number too — JustTCG's number filter surfaces the exact
        // obscure printing (promos, brand-new secret rares) that name-only misses.
        const jt = await searchJustTcg(jtQuery, number ?? undefined);
        const seen = new Set(out.map((c) => `${c.name.toLowerCase()}|${c.number}`));
        for (const c of jt) {
          const k = `${c.name.toLowerCase()}|${c.number}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(c);
          justtcgAppended++;
          if (out.length >= 14) break;
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
      extracted_number: number,
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
    debug: { nameCandidates, number, poolSize: pool.length, justtcgAppended, top },
  });
}
