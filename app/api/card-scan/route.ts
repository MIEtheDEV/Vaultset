import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isUserAdmin } from "@/lib/auth/admin";
import { matchScan, manualLookup } from "@/lib/scan/matchScan";

// Card scanner (admin-only, beta). The browser OCRs the card's body text and
// POSTs it here; matchScan() fingerprint-matches it to the card DB and returns
// candidate printings. Free Tier-1 identity path — no paid API. The matching
// pipeline lives in lib/scan/matchScan so it can be replayed locally against real
// logged OCR text (scripts/scan-replay.ts). See docs/card-scanning-research.md.

// The POST cascades pokemontcg.io + up to two JustTCG probes; each upstream is
// individually timeout-bounded (lib/http fetchWithTimeout), and this caps the
// whole request so a slow provider can't hang past the platform default.
export const maxDuration = 30;

/** GET → { enabled }: any signed-in user may use the scanner (GA — no longer admin-gated). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({ enabled: !!user });
}

/** POST { text, lines, bytes? } → { candidates, confident, debug }. Any signed-in user. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = await isUserAdmin(user.id);

  let body: { text?: string; lines?: string[]; bytes?: number; name?: string; number?: string; image?: string; nameHints?: string[]; numberHints?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Manual refine: user typed the collector number for a card OCR couldn't fully read.
  if (body.name && body.number) {
    const m = await manualLookup(body.name, String(body.number));
    return NextResponse.json({ candidates: m.candidates, confident: m.confident, debug: m.debug });
  }

  const text = (body.text ?? "").trim();
  const lines = Array.isArray(body.lines) ? body.lines.filter((l) => typeof l === "string") : [];
  const numberHints = Array.isArray(body.numberHints)
    ? body.numberHints.filter((n): n is string => typeof n === "string")
    : [];
  const nameHints = Array.isArray(body.nameHints)
    ? body.nameHints.filter((n): n is string => typeof n === "string")
    : [];

  const { candidates, confident, debug } = await matchScan(text, lines, numberHints, nameHints);

  // Persist a diagnostics row (+ the cropped image) so real-world phone failures
  // are reviewable and OCR can be tuned against real foils. Best-effort throughout.
  try {
    const admin = createAdminClient();

    // Upload the cropped image the client OCR'd (data URL) to private storage —
    // ADMIN ONLY. Now the scanner is GA, we don't store every user's card photo
    // (storage + privacy); admin scans still log images so OCR can be tuned.
    let imagePath: string | null = null;
    if (isAdmin && typeof body.image === "string" && body.image.startsWith("data:")) {
      const b64 = body.image.split(",")[1] ?? "";
      const buf = Buffer.from(b64, "base64");
      if (buf.length > 0 && buf.length < 3_000_000) {
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: upErr } = await admin.storage
          .from("scan-diagnostics")
          .upload(path, buf, { contentType: "image/jpeg" });
        if (!upErr) imagePath = path;
      }
    }

    await admin.from("scan_diagnostics").insert({
      user_id: user.id,
      ocr_text: text,
      ocr_char_count: text.length,
      name_candidates: debug.nameCandidates,
      extracted_number: debug.numberCandidates.length ? debug.numberCandidates.join(" ") : null,
      // Logged distinctly so we can measure the number-read rate: reliable_number is
      // the confident NNN/TTT read; number_hints is what the on-device bottom-strip
      // OCR recovered. extracted_number stays the noisy union for continuity.
      reliable_number: debug.collectorNumber,
      number_hints: debug.numberHints.length ? debug.numberHints : null,
      pool_size: debug.poolSize,
      justtcg_appended: debug.justtcgAppended,
      confident,
      top_matches: debug.top,
      result_candidates: candidates.map((c) => ({ id: c.id, name: c.name, set: c.set?.name ?? "", number: c.number })),
      image_bytes: typeof body.bytes === "number" ? body.bytes : null,
      image_path: imagePath,
      user_agent: request.headers.get("user-agent"),
    });
  } catch {
    /* logging is best-effort */
  }

  return NextResponse.json({ candidates, confident, debug });
}
