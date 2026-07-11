import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isUserAdmin } from "@/lib/auth/admin";
import { manualLookup } from "@/lib/scan/matchScan";
import { matchHashes, type ScoredEntry } from "@/lib/scan/hashIndex";
import type { HashPair } from "@/lib/scan/perceptualHash";
import { fetchPokemonCardsByIds } from "@/lib/search/PokemonTCGProvider";
import { searchJustTcg } from "@/lib/search/justTcgSearch";
import { normalizeCardNumber } from "@/lib/search/cardNumber";
import type { SearchResult } from "@/lib/search/CardSearchProvider";

// Card scanner. The browser crops + perspective-corrects the card photo AND
// computes its perceptual hashes on-device (canvas — no native module), then
// POSTs the hex hashes here; matchHashes() (lib/scan/hashIndex) compares them
// against the prebuilt index of every known card image and returns candidate
// printings. Pure-JS on the server — no sharp/libvips (which fails to load on
// Vercel's Lambda runtime). Free path — no OCR, no per-scan API spend on the
// happy path. Measured 52/52 top-1 exact printing on the real-photo corpus
// (scripts/scan-replay.ts replays that corpus against this exact matcher
// locally — no deploy needed to test matching changes).
export const maxDuration = 15;

/** Validate a client-sent variant-hash array: hex-string pairs (dHash-256 = 64
 *  hex chars, pHash-64 = 16 hex chars). Up to 36 to accommodate a multi-frame
 *  burst (up to 12 frames × 3 crop variants); matchHashes takes the best over
 *  all of them, so more frames just means a better shot at beating glare. */
function parseHashes(raw: unknown): HashPair[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 36) return null;
  const out: HashPair[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") return null;
    const { d, p } = v as { d?: unknown; p?: unknown };
    if (typeof d !== "string" || !/^[0-9a-f]{64}$/.test(d)) return null;
    if (typeof p !== "string" || !/^[0-9a-f]{16}$/.test(p)) return null;
    out.push({ d, p });
  }
  return out;
}

/** GET → { enabled }: any signed-in user may use the scanner. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({ enabled: !!user });
}

/** A tappable candidate straight from index metadata — complete enough to
 *  display and to pick (the add flow resolves prices lazily on select via
 *  /api/card-price, and re-fetches full details by id). Used for native +
 *  `tcg:` entries so the hot path needs no external call for them. */
function fromIndex(entry: ScoredEntry): SearchResult {
  return {
    id: entry.id,
    name: entry.name,
    number: entry.number,
    set: { id: entry.id.includes(":") ? "" : entry.setId, name: entry.setName },
    images: { small: entry.img, large: entry.img },
    tcgplayer: null,
  } as SearchResult;
}

/** Map matched index entries → SearchResult candidates the add flow understands.
 *  Bounded so a scan can't exceed the route's maxDuration (the cause of the
 *  earlier 504s): the ONLY external calls are one best-effort pokemontcg.io
 *  batch (native rarity/prices, 8s) and, rarely, per-`tcgdex:` JustTCG lookups —
 *  and they all run CONCURRENTLY, so total latency is the slowest single call,
 *  not their sum. `tcg:` entries (promos already in our catalog) and native
 *  entries render from index metadata; prices load on select. */
async function toCandidates(top: ScoredEntry[]): Promise<{ candidates: SearchResult[]; droppedTop: boolean }> {
  // tcgdex: match keys aren't storable — resolve each to a JustTCG (tcg:) card.
  const tcgdex = top.filter((e) => e.id.startsWith("tcgdex:"));
  const [native, tcgdexResolved] = await Promise.all([
    fetchPokemonCardsByIds(top.map((e) => e.id)),
    Promise.all(
      tcgdex.map(async (e) => {
        const jt = await searchJustTcg(e.name, e.number);
        return {
          id: e.id,
          card: jt.find((c) => normalizeCardNumber(c.number) === normalizeCardNumber(e.number)) ?? null,
        };
      }),
    ),
  ]);
  const nativeById = new Map(native.map((c) => [c.id, c]));
  const tcgdexById = new Map(tcgdexResolved.map((r) => [r.id, r.card]));

  const out: SearchResult[] = [];
  let droppedTop = false;
  for (const [i, entry] of top.entries()) {
    if (entry.id.startsWith("tcgdex:")) {
      const resolved = tcgdexById.get(entry.id);
      if (resolved) out.push(resolved);
      else if (i === 0) droppedTop = true; // top match unresolvable → not confident
      continue;
    }
    // Native: prefer the enriched copy (rarity + prices) when the batch returned
    // in time; otherwise the index metadata is a complete, pickable fallback.
    out.push(nativeById.get(entry.id) ?? fromIndex(entry));
  }
  return { candidates: out, droppedTop };
}

/** POST { hashes, image?, bytes? } → { candidates, confident, debug }.
 *  POST { name, number } → manual refine (unchanged fallback path).
 *  `hashes` are computed on-device; `image` (optional) is stored for admin
 *  diagnostics only and never processed server-side. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { hashes?: unknown; image?: string; bytes?: number; name?: string; number?: string };
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

  const hashes = parseHashes(body.hashes);
  if (!hashes) {
    return NextResponse.json({ error: "Missing or malformed scan hashes" }, { status: 400 });
  }

  // Optional cropped image — ADMIN diagnostics only. Stored as-is (never decoded
  // server-side); bounded so a bad client can't push large payloads.
  let imageBuf: Buffer | null = null;
  if (typeof body.image === "string" && body.image.startsWith("data:")) {
    const buf = Buffer.from(body.image.split(",")[1] ?? "", "base64");
    if (buf.length > 0 && buf.length < 3_000_000) imageBuf = buf;
  }

  const match = await matchHashes(hashes);

  const { candidates, droppedTop } = match.top.length
    ? await toCandidates(match.top)
    : { candidates: [], droppedTop: false };
  // Never report confidence in a card we couldn't resolve to a storable id.
  const confident = match.confident && !droppedTop && candidates.length > 0;

  // ~3 crop variants per captured frame.
  const nFrames = Math.max(1, Math.round(hashes.length / 3));
  const debug = {
    matchedVia: "hash" as const,
    bestDistance: match.bestDistance,
    bestDistanceFirstFrame: match.bestDistanceFirstFrame,
    nFrames,
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
    if (isAdmin && imageBuf) {
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
      n_frames: nFrames,
      single_frame_distance: match.bestDistanceFirstFrame,
      pool_size: match.indexSize,
      confident,
      top_matches: debug.top,
      result_candidates: candidates.map((c) => ({ id: c.id, name: c.name, set: c.set?.name ?? "", number: c.number })),
      image_bytes: typeof body.bytes === "number" ? body.bytes : (imageBuf?.length ?? null),
      image_path: imagePath,
      user_agent: request.headers.get("user-agent"),
    });
  } catch {
    /* logging is best-effort */
  }

  return NextResponse.json({ candidates, confident, debug });
}
