import { gunzipSync } from "zlib";
import { createAdminClient } from "@/utils/supabase/admin";
import { hashFromHex, variantDistance, type HashPair } from "@/lib/scan/perceptualHash";

// Server-side scan matcher. Downloads the prebuilt perceptual-hash index
// artifact (scripts/build-scan-index.ts → scan-index/index.json.gz), caches it
// in module scope, and matches CLIENT-COMPUTED hashes against every known card
// by hamming distance. Pure JS — NO sharp/libvips (which fails to load on
// Vercel's Lambda runtime). The browser computes the scan's hashes from canvas
// pixels; this module only compares hex. Backend-only (admin client).

export interface HashIndexEntry {
  id: string;       // pokemontcg.io id | tcg:<productId> | tcgdex:<cardId>
  name: string;
  number: string;
  setId: string;
  setName: string;
  img: string;
  d: string;
  p: string;
}

export interface ScoredEntry extends HashIndexEntry {
  dist: number;
}

export interface ImageMatch {
  top: ScoredEntry[];
  confident: boolean;
  bestDistance: number | null;
  margin: number | null;
  indexSize: number;
  builtAt: string | null;
}

// Measured on the 52-scan real-photo corpus: true matches land well under this
// distance with a clear separation from every different-named card. The gate
// accepts a hit only when it's both absolutely close and clearly separated;
// same-name alternate printings don't break confidence — they're the tie-set.
const CONFIDENT_MAX_DISTANCE = 125;
const CONFIDENT_MIN_MARGIN = 10;
const TOP_K = 8;

interface LoadedIndex {
  entries: { meta: HashIndexEntry; d: Uint8Array; p: Uint8Array }[];
  builtAt: string | null;
  loadedAt: number;
}

const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
let cached: LoadedIndex | null = null;
let loading: Promise<LoadedIndex | null> | null = null;

async function loadIndex(): Promise<LoadedIndex | null> {
  if (cached && Date.now() - cached.loadedAt < INDEX_TTL_MS) return cached;
  if (!loading) {
    loading = (async () => {
      try {
        const admin = createAdminClient();
        const { data, error } = await admin.storage.from("scan-index").download("index.json.gz");
        if (error || !data) {
          console.warn("[SCAN] hash index unavailable:", error?.message ?? "no data");
          return cached; // serve a stale index over none at all
        }
        const json = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8")) as {
          builtAt?: string;
          entries: HashIndexEntry[];
        };
        cached = {
          entries: json.entries.map((meta) => ({ meta, d: hashFromHex(meta.d), p: hashFromHex(meta.p) })),
          builtAt: json.builtAt ?? null,
          loadedAt: Date.now(),
        };
        return cached;
      } catch (e) {
        console.warn("[SCAN] hash index load failed:", (e as Error).message);
        return cached;
      } finally {
        loading = null;
      }
    })();
  }
  return loading;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Match client-computed scan hashes (hex variant pairs) against the full index. */
export async function matchHashes(variants: HashPair[]): Promise<ImageMatch> {
  const index = await loadIndex();
  if (!index || index.entries.length === 0 || variants.length === 0) {
    return { top: [], confident: false, bestDistance: null, margin: null, indexSize: index?.entries.length ?? 0, builtAt: index?.builtAt ?? null };
  }

  const decoded = variants.map((v) => ({ d: hashFromHex(v.d), p: hashFromHex(v.p) }));

  // Full linear scan: ~20k entries × 40-byte XOR/popcount is a few milliseconds.
  const scored: ScoredEntry[] = index.entries.map(({ meta, d, p }) => ({
    ...meta,
    dist: variantDistance(decoded, d, p),
  }));
  scored.sort((a, b) => a.dist - b.dist);

  const top = scored.slice(0, TOP_K);
  const best = top[0];
  const bestName = normName(best.name);
  const rival = scored.find((e) => normName(e.name) !== bestName);
  const margin = rival ? rival.dist - best.dist : null;
  const confident =
    best.dist <= CONFIDENT_MAX_DISTANCE && (margin === null || margin >= CONFIDENT_MIN_MARGIN);

  return {
    top,
    confident,
    bestDistance: best.dist,
    margin,
    indexSize: index.entries.length,
    builtAt: index.builtAt,
  };
}
