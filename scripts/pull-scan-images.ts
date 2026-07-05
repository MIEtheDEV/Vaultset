/**
 * Download recent scan images locally so OCR can be tuned against real foils
 * without deploy/fail loops (the image-side counterpart to scan-replay.ts).
 *
 *   npx tsx scripts/pull-scan-images.ts [limit]
 *
 * Writes images to <tmp>/vaultset-scan-images/ and prints each file path next to
 * that scan's OCR name candidates + number, so failures are easy to line up.
 */
export {};

async function main() {
  try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }
  const os = await import("os");
  const fs = await import("fs");
  const path = await import("path");
  const { createAdminClient } = await import("@/utils/supabase/admin");

  const limit = Number(process.argv[2] ?? 10);
  const outDir = path.join(os.tmpdir(), "vaultset-scan-images");
  fs.mkdirSync(outDir, { recursive: true });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scan_diagnostics")
    .select("created_at, image_path, name_candidates, extracted_number")
    .not("image_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("DB error:", error.message); process.exit(1); }

  console.log(`Downloading to ${outDir}\n`);
  for (const row of data ?? []) {
    const p = row.image_path as string;
    const { data: blob, error: dlErr } = await admin.storage.from("scan-diagnostics").download(p);
    if (dlErr || !blob) { console.log(`skip ${p}: ${dlErr?.message ?? "no data"}`); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const local = path.join(outDir, p);
    fs.writeFileSync(local, buf);
    console.log(`${local}`);
    console.log(`   ${row.created_at} · names: ${(row.name_candidates ?? []).join(", ") || "—"} · number: ${row.extracted_number ?? "—"}\n`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
