import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isUserAdmin } from "@/lib/auth/admin";
import { manualLookup } from "@/lib/scan/matchScan";
// Type-only import — erased at compile time, so it does NOT pull in the
// sharp-dependent matcher module. matchImage is dynamically imported inside
// POST (below) so the GET handler that gates the scan button never loads sharp.
import type { ScoredEntry } from "@/lib/scan/hashIndex";
import { fetchPokemonCardsByIds } from "@/lib/search/PokemonTCGProvider";
import { searchJustTcg, getJustTcgById } from "@/lib/search/justTcgSearch";
import { normalizeCardNumber } from "@/lib/search/cardNumber";
import type { SearchResult } from "@/lib/search/CardSearchProvider";

// Card scanner. The browser crops + perspective-corrects the card photo and
// POSTs the image here; matchImage() (lib/scan/hashIndex) matches its
// perceptual hash against the prebuilt index of every known card image and
// returns candidate printings. Free path — no OCR, no per-scan API spend on
// the happy path. Measured 52/52 top-1 exact printing on the real-photo
// corpus (scripts/scan-replay.ts replays that corpus against this exact
// matcher locally — no deploy needed to test matching changes).
export const maxDuration = 15;

/** GET → { enabled }: any signed-in user may use the scanner. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({ enabled: !!user });
}

/** Map matched index entries → SearchResult candidates the add flow understands.
 *  Native ids are batch-fetched (prices + rarity); tcg:/tcgdex: gap entries are
 *  resolved through JustTCG so they carry a storable `tcg:` id and prices. */
async function toCandidates(top: ScoredEntry[]): Promise<{ candidates: SearchResult[]; droppedTop: boolean }> {
  const native = await fetchPokemonCardsByIds(top.map((e) => e.id));
  const byId = new Map(native.map((c) => [c.id, c]));

  const out: SearchResult[] = [];
  let droppedTop = false;
  for (const [i, entry] of top.entries()) {
    if (!entry.id.includes(":")) {
      const full = byId.get(entry.id);
      if (full) {
        out.push(full);
      } else {
        // Batch fetch missed (upstream hiccup) — fall back to index metadata so
        // the candidate still renders; the add flow re-fetches details by id.
        out.push({
          id: entry.id, name: entry.name, number: entry.number,
          set: { id: entry.setId, name: entry.setName },
          images: { small: entry.img, large: entry.img }, tcgplayer: null,
        } as SearchResult);
      }
      continue;
    }
    if (entry.id.startsWith("tcg:")) {
      const viaJustTcg = await getJustTcgById(entry.id.slice(4));
      out.push(
        viaJustTcg ?? ({
          id: entry.id, name: entry.name, number: entry.number,
          set: { id: "", name: entry.setName },
          images: { small: entry.img, large: entry.img }, tcgplayer: null,
        } as SearchResult),
      );
      continue;
    }
    // tcgdex: match keys aren't storable ids — resolve to a JustTCG (tcg:) card
    // by name+number. Unresolvable entries are dropped from the shortlist.
    const jt = await searchJustTcg(entry.name, entry.number);
    const exact = jt.find((c) => normalizeCardNumber(c.number) === normalizeCardNumber(entry.number));
    if (exact) {
      out.push(exact);
    } else if (i === 0) {
      droppedTop = true;
    }
  }
  return { candidates: out, droppedTop };
}

/** POST { image, bytes? } → { candidates, confident, debug }.
 *  POST { name, number } → manual refine (unchanged fallback path). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { image?: string; bytes?: number; name?: string; number?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Manual refine: the user typed the name/number for a card the matcher
  // couldn't confidently place (or to pull a different printing).
  if (body.name && body.number) {
    const m = await manualLookup(body.name, String(body.number));
    return NextResponse.json({ candidates: m.candidates, confident: m.confident, debug: m.debug });
  }

  if (typeof body.image !== "string" || !body.image.startsWith("data:")) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }
  const b64 = body.image.split(",")[1] ?? "";
  const imageBuf = Buffer.from(b64, "base64");
  if (imageBuf.length === 0 || imageBuf.length > 3_000_000) {
    return NextResponse.json({ error: "Bad image" }, { status: 400 });
  }

  let match;
  try {
    // Lazy-loaded so the sharp native module only initializes on an actual
    // image scan — never for the GET button-gate or the manual-lookup path.
    const { matchImage } = await import("@/lib/scan/hashIndex");
    match = await matchImage(imageBuf);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    const stack = (e as Error)?.stack ?? "";
    console.error("[SCAN] matchImage failed:", msg, stack);
    // Best-effort: persist the real error so a production failure is
    // diagnosable remotely (read via scan_diagnostics where matched_via='error').
    try {
      const admin = createAdminClient();
      await admin.from("scan_diagnostics").insert({
        user_id: user.id,
        matched_via: "error",
        ocr_text: `${msg}\n${stack}`.slice(0, 4000),
        image_bytes: typeof body.bytes === "number" ? body.bytes : imageBuf.length,
        user_agent: request.headers.get("user-agent"),
      });
    } catch { /* logging is best-effort */ }
    return NextResponse.json({ error: "Could not read that image — try another photo." }, { status: 422 });
  }

  const { candidates, droppedTop } = match.top.length
    ? await toCandidates(match.top)
    : { candidates: [], droppedTop: false };
  // Never report confidence in a card we couldn't resolve to a storable id.
  const confident = match.confident && !droppedTop && candidates.length > 0;

  const debug = {
    matchedVia: "hash" as const,
    bestDistance: match.bestDistance,
    margin: match.margin,
    indexSize: match.indexSize,
    indexBuiltAt: match.builtAt,
    top: match.top.map((e) => ({ id: e.id, name: e.name, set: e.setName, number: e.number, dist: e.dist })),
  };

  // Persist a diagnostics row (+ the cropped image for admins) so real-world
  // failures stay reviewable and thresholds can be tuned against real photos.
  try {
    const admin = createAdminClient();
    const isAdmin = await isUserAdmin(user.id);

    let imagePath: string | null = null;
    if (isAdmin) {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await admin.storage
        .from("scan-diagnostics")
        .upload(path, imageBuf, { contentType: "image/jpeg" });
      if (!upErr) imagePath = path;
    }

    await admin.from("scan_diagnostics").insert({
      user_id: user.id,
      matched_via: "hash",
      match_distance: match.bestDistance,
      match_margin: match.margin,
      pool_size: match.indexSize,
      confident,
      top_matches: debug.top,
      result_candidates: candidates.map((c) => ({ id: c.id, name: c.name, set: c.set?.name ?? "", number: c.number })),
      image_bytes: typeof body.bytes === "number" ? body.bytes : imageBuf.length,
      image_path: imagePath,
      user_agent: request.headers.get("user-agent"),
    });
  } catch {
    /* logging is best-effort */
  }

  return NextResponse.json({ candidates, confident, debug });
}
