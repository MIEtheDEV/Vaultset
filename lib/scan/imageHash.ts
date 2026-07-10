import sharp from "sharp";
import { scanVariantHashes, catalogHashPair, type HashPair } from "@/lib/scan/perceptualHash";

// NODE-ONLY. Uses sharp to decode an image buffer to RGBA pixels, then hands
// those pixels to the isomorphic hasher (lib/scan/perceptualHash). Imported
// ONLY by the offline index builder (scripts/build-scan-index.ts) and the
// replay harness (scripts/scan-replay.ts) — NEVER by the API route or the
// browser. That's deliberate: sharp/libvips fails to load on Vercel's Lambda
// runtime, so it must stay out of the request path. At runtime the browser
// computes the scan hashes from canvas pixels and the server only compares hex.
//
// Source is pre-resized to ~256px long edge before decode so the box-average
// hasher runs fast and matches the browser's canvas-256 path closely.

const WORK_EDGE = 256;

async function toRGBA(input: Buffer, trim: boolean): Promise<{ rgba: Uint8Array; w: number; h: number }> {
  let pipe = sharp(input);
  if (trim) pipe = pipe.trim({ threshold: 25 }); // strip white product-shot padding
  const { data, info } = await pipe
    .resize(WORK_EDGE, WORK_EDGE, { fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), w: info.width, h: info.height };
}

/** Hash a reference catalog image → single hex pair (matches the index build). */
export async function hashCatalogImage(input: Buffer, trim = false): Promise<HashPair> {
  const { rgba, w, h } = await toRGBA(input, trim);
  return catalogHashPair(rgba, w, h);
}

/** Hash a scan photo → variant hex pairs (matches what the browser sends). */
export async function hashScanVariants(input: Buffer): Promise<HashPair[]> {
  const { rgba, w, h } = await toRGBA(input, false);
  return scanVariantHashes(rgba, w, h);
}
