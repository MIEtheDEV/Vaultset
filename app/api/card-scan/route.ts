import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isUserAdmin } from "@/lib/auth/admin";
import { matchScan } from "@/lib/scan/matchScan";

// Card scanner (admin-only, beta). The browser OCRs the card's body text and
// POSTs it here; matchScan() fingerprint-matches it to the card DB and returns
// candidate printings. Free Tier-1 identity path — no paid API. The matching
// pipeline lives in lib/scan/matchScan so it can be replayed locally against real
// logged OCR text (scripts/scan-replay.ts). See docs/card-scanning-research.md.

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

  const { candidates, confident, debug } = await matchScan(text, lines);

  // Persist a diagnostics row so real-world (phone/production) failures are
  // reviewable from the DB. Best-effort: never fail a scan on a logging error.
  try {
    const admin = createAdminClient();
    await admin.from("scan_diagnostics").insert({
      user_id: user.id,
      ocr_text: text,
      ocr_char_count: text.length,
      name_candidates: debug.nameCandidates,
      extracted_number: debug.numberCandidates.length ? debug.numberCandidates.join(" ") : null,
      pool_size: debug.poolSize,
      justtcg_appended: debug.justtcgAppended,
      confident,
      top_matches: debug.top,
      result_candidates: candidates.map((c) => ({ id: c.id, name: c.name, set: c.set?.name ?? "", number: c.number })),
      image_bytes: typeof body.bytes === "number" ? body.bytes : null,
      user_agent: request.headers.get("user-agent"),
    });
  } catch {
    /* logging is best-effort */
  }

  return NextResponse.json({ candidates, confident, debug });
}
