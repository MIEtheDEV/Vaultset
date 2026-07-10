/**
 * Download recent (admin-only) scan images locally so the matcher can be tuned
 * against real captures without deploy/fail loops (the image-side counterpart to
 * scan-replay.ts). Prints each image path next to its hash-match result so a
 * failing scan is easy to line up with what the matcher saw.
 *
 *   npx tsx scripts/pull-scan-images.ts [limit]
 *
 * Writes images to <tmp>/vaultset-scan-images/.
 */
export {};

interface TopMatch { name?: string; number?: string; dist?: number }

async function main() {
  try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }
  const os = await import("os");
  const fs = await import("fs");
  const path = await import("path");
  const { createAdminClient } = await import("@/utils/supabase/admin");

  const limit = Number(process.argv[2] ?? 12);
  const outDir = path.join(os.tmpdir(), "vaultset-scan-images");
  fs.mkdirSync(outDir, { recursive: true });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scan_diagnostics")
    .select("created_at, image_path, matched_via, match_distance, match_margin, confident, top_matches")
    .not("image_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("DB error:", error.message); process.exit(1); }

  console.log(`Downloading to ${outDir}\n`);
  for (const row of data ?? []) {
    const p = row.image_path as string;
    const { data: blob, error: dlErr } = await admin.storage.from("scan-diagnostics").download(p);
    if (dlErr || !blob) { console.log(`skip ${p}: ${dlErr?.message ?? "no data"}`); continue; }
    fs.writeFileSync(path.join(outDir, p), Buffer.from(await blob.arrayBuffer()));
    const top = ((row.top_matches ?? []) as TopMatch[])
      .slice(0, 3)
      .map((t) => `${t.name} #${t.number} (d=${t.dist})`)
      .join("  |  ") || "—";
    console.log(path.join(outDir, p));
    console.log(`   ${row.created_at} · dist ${row.match_distance ?? "—"} margin ${row.match_margin ?? "—"} · ${row.confident ? "CONFIDENT" : "not confident"}`);
    console.log(`   top: ${top}\n`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
