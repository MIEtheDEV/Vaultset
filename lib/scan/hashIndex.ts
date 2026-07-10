import { gunzipSync } from "zlib";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  hashScanImage,
  hashFromHex,
  scanDistance,
  type ScanHashes,
} from "@/lib/scan/imageHash";

// Server-side scan matcher: downloads the prebuilt perceptual-hash index
// artifact (scripts/build-scan-index.ts → scan-index/index.json.gz), caches it
// in module scope, and matches an uploaded card photo against every known card
// by hamming distance. Backend-only (admin client) — never import client-side.

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
  /** Distance of the best match (lower = closer; ≤ ~120 is a real hit). */
  bestDistance: number | null;
  /** Gap between the best match and the closest *different-named* card. */
  margin: number | null;
  indexSize: number;
  builtAt: string | null;
}

// Measured on the 52-scan real-photo corpus: true matches landed at combined
// distance 53–120 while the best wrong candidate was ≥126. The gate accepts a
// hit only when it's both absolutely close and clearly separated from every
// different-named card (same-name alternate printings don't break confidence —
// they're the tie-set the user picks from).
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

/** Match a (perspective-corrected) card photo against the full card index. */
export async function matchImage(image: Buffer): Promise<ImageMatch> {
  const index = await loadIndex();
  if (!index || index.entries.length === 0) {
    return { top: [], confident: false, bestDistance: null, margin: null, indexSize: 0, builtAt: null };
  }

  const scan: ScanHashes = await hashScanImage(image);

  // Full linear scan: ~20k entries × 40-byte XOR/popcount is a few milliseconds.
  const scored: ScoredEntry[] = index.entries.map(({ meta, d, p }) => ({
    ...meta,
    dist: scanDistance(scan, d, p),
  }));
  scored.sort((a, b) => a.dist - b.dist);

  const top = scored.slice(0, TOP_K);
  const best = top[0];
  // Margin vs the closest card that isn't just another printing of the same name.
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
