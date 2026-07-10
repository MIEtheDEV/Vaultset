/**
 * Build (or incrementally refresh) the card-scan perceptual-hash index.
 *
 *   pnpm scan:index            # incremental — hashes only cards not yet indexed
 *   pnpm scan:index --full     # rebuild every hash from scratch
 *
 * Sources, in order:
 *   1. pokemontcg.io — the full card catalog (~20k cards, primary).
 *   2. TCGdex — sets pokemontcg.io doesn't carry yet (e.g. MEP Black Star
 *      Promos); only cards that actually have an image. Matched entries are
 *      resolved to a JustTCG card at scan time (internal `tcgdex:` match key).
 *   3. Our own `cards` table — JustTCG-sourced cards with TCGplayer CDN images
 *      (`tcg:<productId>` ids) not covered above. Product shots are padded on
 *      white, so they're trimmed before hashing.
 *
 * Output: gzipped JSON artifact `index.json.gz` in the private `scan-index`
 * storage bucket, downloaded and cached by lib/scan/hashIndex.ts at scan time.
 * Re-run after each new set release (or when new-set scans start missing).
 */
export {};

interface IndexEntry {
  id: string;       // pokemontcg.io id | tcg:<productId> | tcgdex:<cardId>
  name: string;
  number: string;
  setId: string;
  setName: string;
  img: string;
  d: string;        // dhash256 hex
  p: string;        // phash64 hex
}

const PTCG_BASE = "https://api.pokemontcg.io/v2";
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const BUCKET = "scan-index";
const ARTIFACT = "index.json.gz";

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function fetchJsonWithRetry(url: string, headers: Record<string, string> = {}, tries = 4): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
}

async function main() {
  try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }
  const full = process.argv.includes("--full");

  const { gzipSync, gunzipSync } = await import("zlib");
  const sharp = (await import("sharp")).default;
  const { hashCatalogImage, hashToHex } = await import("@/lib/scan/imageHash");
  const { normalizeCardNumber } = await import("@/lib/search/cardNumber");
  const { createAdminClient } = await import("@/utils/supabase/admin");
  const admin = createAdminClient();

  const headers: Record<string, string> = process.env.POKEMON_TCG_API_KEY
    ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
    : {};

  // ---- 0. Existing artifact (for incremental refresh) --------------------
  const existing = new Map<string, IndexEntry>();
  if (!full) {
    const { data } = await admin.storage.from(BUCKET).download(ARTIFACT);
    if (data) {
      try {
        const json = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8"));
        for (const e of json.entries as IndexEntry[]) existing.set(e.id, e);
        console.log(`existing artifact: ${existing.size} entries`);
      } catch (e) {
        console.warn("could not parse existing artifact, rebuilding:", (e as Error).message);
      }
    }
  }

  // ---- 1. pokemontcg.io catalog ------------------------------------------
  type Meta = Omit<IndexEntry, "d" | "p">;
  const catalog: Meta[] = [];
  let page = 1;
  for (;;) {
    const json = (await fetchJsonWithRetry(
      `${PTCG_BASE}/cards?page=${page}&pageSize=250&select=id,name,number,set,images`,
      headers,
    )) as { data?: { id: string; name: string; number: string; set?: { id?: string; name?: string }; images?: { small?: string; large?: string } }[]; totalCount?: number };
    const batch = (json.data ?? []).flatMap((c) => {
      const img = c.images?.small ?? c.images?.large;
      return img
        ? [{ id: c.id, name: c.name, number: c.number, setId: c.set?.id ?? "", setName: c.set?.name ?? "", img }]
        : [];
    });
    catalog.push(...batch);
    console.log(`pokemontcg.io page ${page}: total ${catalog.length}/${json.totalCount ?? "?"}`);
    if (batch.length === 0 || catalog.length >= (json.totalCount ?? 0)) break;
    page++;
  }

  const covered = new Set(catalog.map((c) => `${normName(c.name)}|${normalizeCardNumber(c.number)}`));

  // ---- 2. TCGdex gap sets --------------------------------------------------
  const gaps: { meta: Meta; trim: boolean }[] = [];
  try {
    const ptcgSets = (await fetchJsonWithRetry(`${PTCG_BASE}/sets?pageSize=250&select=id,name`, headers)) as { data?: { name: string }[] };
    const ptcgSetNames = new Set((ptcgSets.data ?? []).map((s) => normName(s.name)));
    const dexSets = (await fetchJsonWithRetry(`${TCGDEX_BASE}/sets`)) as { id: string; name: string }[];
    const missing = dexSets.filter((s) => !ptcgSetNames.has(normName(s.name)));
    console.log(`TCGdex sets not in pokemontcg.io: ${missing.length}`);
    // Only recent gap sets matter for scanning (old sets are fully covered);
    // fetching card details for every historical oddity would be slow and add
    // near-duplicate noise, so cap to the tail of the list (TCGdex orders by age).
    for (const set of missing.slice(-12)) {
      const detail = (await fetchJsonWithRetry(`${TCGDEX_BASE}/sets/${set.id}`)) as { cards?: { id: string; localId: string; name: string }[] };
      for (const card of detail.cards ?? []) {
        const key = `${normName(card.name)}|${normalizeCardNumber(card.localId)}`;
        if (covered.has(key)) continue;
        const cardDetail = (await fetchJsonWithRetry(`${TCGDEX_BASE}/cards/${card.id}`)) as { image?: string };
        if (!cardDetail.image) continue; // TCGdex lists cards before it has scans
        covered.add(key);
        gaps.push({
          meta: {
            id: `tcgdex:${card.id}`, name: card.name, number: card.localId,
            setId: set.id, setName: set.name, img: `${cardDetail.image}/low.webp`,
          },
          trim: false,
        });
      }
    }
  } catch (e) {
    console.warn("TCGdex gap-fill skipped:", (e as Error).message);
  }

  // ---- 3. Our cards table (JustTCG/TCGplayer-sourced promos) ---------------
  {
    const { data, error } = await admin
      .from("cards")
      .select("name, card_number, set_name, image_url")
      .ilike("image_url", "%tcgplayer-cdn.tcgplayer.com%");
    if (error) console.warn("cards-table sweep skipped:", error.message);
    for (const row of data ?? []) {
      const productId = /product\/(\d+)/.exec(row.image_url ?? "")?.[1];
      if (!productId || !row.name) continue;
      // Strip JustTCG name suffixes (" - 072", " (Cosmos Holo)") for the dedup key.
      const cleanName = String(row.name).split(/\s+[-–—]\s+/)[0].replace(/\([^)]*\)/g, "").trim();
      const key = `${normName(cleanName)}|${normalizeCardNumber(String(row.card_number ?? ""))}`;
      if (covered.has(key)) continue;
      covered.add(key);
      gaps.push({
        meta: {
          id: `tcg:${productId}`, name: cleanName, number: String(row.card_number ?? ""),
          setId: "", setName: String(row.set_name ?? ""),
          img: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
        },
        trim: true, // product shots are padded on white
      });
    }
  }
  console.log(`gap cards to index: ${gaps.length}`);

  // ---- 4. Hash everything not already hashed -------------------------------
  const all: { meta: Meta; trim: boolean }[] = [
    ...catalog.map((meta) => ({ meta, trim: false })),
    ...gaps,
  ];
  const currentIds = new Set(all.map((e) => e.meta.id));
  const todo = all.filter((e) => !existing.has(e.meta.id));
  console.log(`hashing ${todo.length} new cards (${all.length - todo.length} reused)`);

  const out: IndexEntry[] = [...existing.values()].filter((e) => currentIds.has(e.id));
  let ok = 0, fail = 0, idx = 0;
  const CONC = 20;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      for (;;) {
        const i = idx++;
        if (i >= todo.length) return;
        const { meta, trim } = todo[i];
        try {
          const res = await fetch(meta.img);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          let buf = Buffer.from(await res.arrayBuffer());
          if (trim) buf = await sharp(buf).trim({ threshold: 25 }).toBuffer();
          const { d, p } = await hashCatalogImage(buf);
          out.push({ ...meta, d: hashToHex(d), p: hashToHex(p) });
          ok++;
        } catch (e) {
          fail++;
          if (fail <= 25) console.warn(`hash failed ${meta.id}: ${(e as Error).message}`);
        }
        if ((ok + fail) % 1000 === 0) console.log(`hashed ${ok + fail}/${todo.length} (fail ${fail})`);
      }
    }),
  );

  // ---- 5. Upload artifact ---------------------------------------------------
  const payload = gzipSync(Buffer.from(JSON.stringify({ builtAt: new Date().toISOString(), entries: out })));
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => { /* exists */ });
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(ARTIFACT, payload, { contentType: "application/gzip", upsert: true });
  if (upErr) {
    console.error("artifact upload failed:", upErr.message);
    process.exit(1);
  }
  console.log(`done: ${out.length} entries (${ok} hashed now, ${fail} failed), artifact ${(payload.length / 1024 / 1024).toFixed(2)} MB`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
