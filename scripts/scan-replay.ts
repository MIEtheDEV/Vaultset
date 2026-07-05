/**
 * Replay real logged OCR text through the live scan-matching pipeline — locally,
 * no deploy. Closes the deploy/fail loop for matching changes: edit matchScan/
 * fingerprint, run this, see exactly what each of your real scans would return.
 *
 *   npx tsx scripts/scan-replay.ts [limit]
 *
 * Pulls the most recent scan_diagnostics rows and runs matchScan() on each,
 * hitting the real pokemontcg.io + JustTCG APIs (keys from .env.local).
 */
export {};

async function main() {
  try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }

  const { createAdminClient } = await import("@/utils/supabase/admin");
  const { matchScan } = await import("@/lib/scan/matchScan");

  const limit = Number(process.argv[2] ?? 6);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scan_diagnostics")
    .select("created_at, ocr_text")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("DB error:", error.message);
    process.exit(1);
  }

  for (const row of data ?? []) {
    await new Promise((r) => setTimeout(r, 3000)); // be gentle on the keyless pokemontcg limit
    const text = ((row.ocr_text as string) ?? "").trim();
    const res = await matchScan(text, text.split("\n"));
    console.log(`\n=== ${row.created_at} ===`);
    console.log("names   :", res.debug.nameCandidates.join(", ") || "—");
    console.log("numbers :", res.debug.numberCandidates.join(", ") || "—",
      `| pool ${res.debug.poolSize} | jt+${res.debug.justtcgAppended} | confident ${res.confident}`);
    console.log("top rank:", res.debug.top.map((t) => `${t.name}#${t.number}=${t.score}`).join("  ") || "—");
    if (res.candidates.length === 0) {
      console.log("results : (none — couldn't identify)");
    } else {
      console.log("results :");
      res.candidates.slice(0, 8).forEach((c, i) =>
        console.log(`   ${i + 1}. ${c.name} — ${c.set?.name ?? ""} #${c.number}  [${c.id}]`));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
