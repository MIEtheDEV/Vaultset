// Isomorphic perceptual hashing — pure JS/TS, NO native modules, NO DOM.
// Runs identically in the browser (canvas pixels) and in Node (sharp-decoded
// pixels for the offline index build + replay). This is the whole point of the
// design: the same code hashes the scan photo client-side and every catalog
// image at build time, so hashes are directly comparable — and the server
// never touches sharp/libvips (which fails to load on Vercel's Lambda runtime).
//
// Input is always RGBA bytes at some working resolution. Callers pre-resize the
// source to ~256px long edge (browser: canvas; Node: sharp) before hashing; the
// box-average below then low-passes any interpolator difference away, so the
// two resize paths produce effectively identical hashes.

/** Box-average RGBA down to outW×outH grayscale, then min-max normalize.
 *  Alpha is flattened over white. Mirrors the old sharp pipeline
 *  (resize→grayscale→normalise) so hashes stay in the same regime. */
function grayDownsampleNormalized(
  rgba: Uint8Array | Uint8ClampedArray | number[],
  w: number,
  h: number,
  outW: number,
  outH: number,
): Float64Array {
  const sum = new Float64Array(outW * outH);
  const count = new Float64Array(outW * outH);
  for (let y = 0; y < h; y++) {
    const oy = Math.min(outH - 1, (y * outH / h) | 0);
    for (let x = 0; x < w; x++) {
      const ox = Math.min(outW - 1, (x * outW / w) | 0);
      const i = (y * w + x) * 4;
      const a = rgba[i + 3] / 255;
      // Flatten over white, then Rec.601 luma. (Exact weights are arbitrary —
      // both index and scan use this same function, so only consistency matters.)
      const r = rgba[i] * a + 255 * (1 - a);
      const g = rgba[i + 1] * a + 255 * (1 - a);
      const b = rgba[i + 2] * a + 255 * (1 - a);
      const o = oy * outW + ox;
      sum[o] += 0.299 * r + 0.587 * g + 0.114 * b;
      count[o] += 1;
    }
  }
  const gray = new Float64Array(outW * outH);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < gray.length; i++) {
    const v = count[i] ? sum[i] / count[i] : 0;
    gray[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range > 0) {
    for (let i = 0; i < gray.length; i++) gray[i] = ((gray[i] - min) / range) * 255;
  }
  return gray;
}

/** 256-bit difference hash: 16 rows × 16 horizontal gradient bits → 32 bytes. */
export function dhash256(rgba: Uint8Array | Uint8ClampedArray | number[], w: number, h: number): Uint8Array {
  const outW = 17, outH = 16;
  const gray = grayDownsampleNormalized(rgba, w, h, outW, outH);
  const bits = new Uint8Array(32);
  let i = 0;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW - 1; x++) {
      if (gray[y * outW + x] < gray[y * outW + x + 1]) bits[i >> 3] |= 1 << (7 - (i & 7));
      i++;
    }
  }
  return bits;
}

/** 64-bit perceptual hash: 32×32 grayscale → 2D DCT-II → top-left 8×8 vs median → 8 bytes. */
export function phash64(rgba: Uint8Array | Uint8ClampedArray | number[], w: number, h: number): Uint8Array {
  const N = 32;
  const gray = grayDownsampleNormalized(rgba, w, h, N, N);
  const cos: number[][] = [];
  for (let k = 0; k < N; k++) {
    cos[k] = [];
    for (let n = 0; n < N; n++) cos[k][n] = Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N));
  }
  const dct = new Float64Array(64);
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) s += gray[y * N + x] * cos[u][y] * cos[v][x];
      }
      dct[u * 8 + v] = s;
    }
  }
  const vals = Array.from(dct.slice(1)); // skip the DC coefficient
  const median = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  const bits = new Uint8Array(8);
  for (let i = 1; i < 64; i++) {
    if (dct[i] > median) bits[i >> 3] |= 1 << (7 - (i & 7));
  }
  return bits;
}

const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1];

export function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POPCOUNT[a[i] ^ b[i]];
  return d;
}

export const hashToHex = (bits: Uint8Array): string =>
  Array.from(bits, (b) => b.toString(16).padStart(2, "0")).join("");

export function hashFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Crop an inset rectangle out of RGBA (center crop by fraction on each edge). */
function cropRGBA(
  rgba: Uint8Array | Uint8ClampedArray | number[],
  w: number,
  h: number,
  inset: number,
): { rgba: Uint8Array; w: number; h: number } {
  const left = Math.round(w * inset), top = Math.round(h * inset);
  const cw = w - 2 * left, ch = h - 2 * top;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcRow = ((y + top) * w + left) * 4;
    out.set((rgba as Uint8Array).subarray(srcRow, srcRow + cw * 4), y * cw * 4);
  }
  return { rgba: out, w: cw, h: ch };
}

export interface HashPair { d: string; p: string }

/** Scan-side hashes: full frame + slight center-insets (3%, 6%) as hex, tolerating
 *  a loose crop that includes a little background. Used by the client and replay. */
export function scanVariantHashes(
  rgba: Uint8Array | Uint8ClampedArray | number[],
  w: number,
  h: number,
): HashPair[] {
  const out: HashPair[] = [];
  for (const inset of [0, 0.03, 0.06]) {
    const src = inset > 0 ? cropRGBA(rgba, w, h, inset) : { rgba, w, h };
    out.push({ d: hashToHex(dhash256(src.rgba, src.w, src.h)), p: hashToHex(phash64(src.rgba, src.w, src.h)) });
  }
  return out;
}

/** Catalog-side hash: single hex pair (clean reference crop, no variants). */
export function catalogHashPair(
  rgba: Uint8Array | Uint8ClampedArray | number[],
  w: number,
  h: number,
): HashPair {
  return { d: hashToHex(dhash256(rgba, w, h)), p: hashToHex(phash64(rgba, w, h)) };
}

/** Combined distance: best over scan variants of dHash + 2×pHash hamming, against
 *  one catalog entry's decoded hashes. Lower = closer. */
export function variantDistance(
  variants: { d: Uint8Array; p: Uint8Array }[],
  d: Uint8Array,
  p: Uint8Array,
): number {
  let best = Infinity;
  for (const v of variants) {
    const dist = hamming(v.d, d) + 2 * hamming(v.p, p);
    if (dist < best) best = dist;
  }
  return best;
}
