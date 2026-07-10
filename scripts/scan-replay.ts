/**
 * Regression-test the card-scan image matcher against the corpus of REAL user
 * phone scans — locally, no deploy. Runs each labeled scan photo through the
 * exact production matcher (lib/scan/hashIndex.matchHashes) and scores it
 * against scripts/scan-ground-truth.json.
 *
 *   pnpm scan:replay
 *
 * Downloads any missing corpus images from the scan-diagnostics bucket into a
 * local cache. Exits non-zero if top-1 accuracy regresses or any scan is
 * CONFIDENTLY wrong (the failure mode that must never ship).
 */
export {};

interface Truth { file: string; name: string; number: string; set: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Truth name matches candidate name (exact normalized, or token-subset for
 *  e.g. "Magnetic Energy" printed with a symbol vs "Magnetic Metal Energy"). */
function nameMatches(truth: string, candidate: string): boolean {
  if (norm(truth) === norm(candidate)) return true;
  const tTok = truth.toLowerCase().split(/\s+/).filter(Boolean);
  const cTok = new Set(candidate.toLowerCase().split(/\s+/).filter(Boolean));
  return tTok.every((t) => cTok.has(t)) || [...cTok].every((c) => tTok.includes(c));
}

async function main() {
  try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  const { createAdminClient } = await import("@/utils/supabase/admin");
  const { matchHashes } = await import("@/lib/scan/hashIndex");
  const { hashScanVariants } = await import("@/lib/scan/imageHash");
  const { normalizeCardNumber } = await import("@/lib/search/cardNumber");

  const truths: Truth[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "scan-ground-truth.json"), "utf8"),
  ).scans;

  // Local corpus cache; download missing images from the diagnostics bucket.
  const cacheDir = path.join(os.tmpdir(), "vaultset-scan-corpus");
  fs.mkdirSync(cacheDir, { recursive: true });
  const admin = createAdminClient();
  for (const t of truths) {
    const local = path.join(cacheDir, t.file);
    if (fs.existsSync(local)) continue;
    const { data, error } = await admin.storage.from("scan-diagnostics").download(t.file);
    if (error || !data) {
      console.error(`corpus image missing and not downloadable: ${t.file} (${error?.message})`);
      process.exit(1);
    }
    fs.writeFileSync(local, Buffer.from(await data.arrayBuffer()));
  }

  let top1 = 0, top5 = 0, confidentRight = 0, confidentWrong = 0;
  const misses: string[] = [];
  for (const t of truths) {
    const buf = fs.readFileSync(path.join(cacheDir, t.file));
    // Mirror the browser: decode+resize to the working edge (sharp here vs
    // canvas in-app), compute the same isomorphic hashes, match server-side.
    const variants = await hashScanVariants(buf);
    const m = await matchHashes(variants);
    const hit = (c: { name: string; number: string }) =>
      nameMatches(t.name, c.name) && normalizeCardNumber(c.number) === normalizeCardNumber(t.number);
    const isTop1 = m.top.length > 0 && hit(m.top[0]);
    const isTop5 = m.top.slice(0, 5).some(hit);
    if (isTop1) top1++;
    if (isTop5) top5++;
    if (m.confident && isTop1) confidentRight++;
    if (m.confident && !isTop1) confidentWrong++;
    const tag = isTop1 ? "TOP1 ✓" : isTop5 ? "top5 ~" : "MISS ✗";
    const conf = m.confident ? " [confident]" : "";
    console.log(`${tag}${conf}  ${t.name} #${t.number} (${t.set})  dist=${m.bestDistance} margin=${m.margin}` +
      (isTop1 ? "" : `  → got: ${m.top[0] ? `${m.top[0].name} #${m.top[0].number} (${m.top[0].setName})` : "nothing"}`));
    if (!isTop1) misses.push(t.file);
  }

  const n = truths.length;
  console.log(`\n=== top-1 ${top1}/${n} · top-5 ${top5}/${n} · confident ${confidentRight + confidentWrong}/${n} (${confidentWrong} WRONG) ===`);
  if (misses.length) console.log("misses:", misses.join(", "));

  // Gates: confident-wrong is a hard fail; top-1 must stay at the measured bar.
  if (confidentWrong > 0) {
    console.error(`FAIL: ${confidentWrong} confidently-wrong scan(s) — never ship this.`);
    process.exit(1);
  }
  if (top1 < n) {
    console.error(`FAIL: top-1 ${top1}/${n} — the corpus previously scored ${n}/${n}.`);
    process.exit(1);
  }
  console.log("PASS");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
