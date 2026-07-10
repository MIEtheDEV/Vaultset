/**
 * @jest-environment node
 */
import sharp from "sharp";
import {
  dhash256,
  phash64,
  hamming,
  hashToHex,
  hashFromHex,
  scanVariantHashes,
  catalogHashPair,
  variantDistance,
} from "@/lib/scan/perceptualHash";
import { hashCatalogImage, hashScanVariants } from "@/lib/scan/imageHash";

/** Deterministic RGBA test pattern (colored gradient blocks). */
function rgbaImage(seed: number, w = 240, h = 336): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i] = (x * 7 + seed * 53) % 256;
      px[i + 1] = (y * 5 + seed * 31) % 256;
      px[i + 2] = ((x + y) * 3 + seed * 17) % 256;
      px[i + 3] = 255;
    }
  }
  return px;
}

async function jpegFromRGBA(px: Uint8Array, w = 240, h = 336): Promise<Buffer> {
  return sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 4 } }).jpeg().toBuffer();
}

const decode = (v: { d: string; p: string }) => ({ d: hashFromHex(v.d), p: hashFromHex(v.p) });

describe("perceptualHash (isomorphic)", () => {
  it("hamming: zero for identical, counts differing bits", () => {
    const a = Uint8Array.from([0b10101010, 0b11110000]);
    expect(hamming(a, a)).toBe(0);
    expect(hamming(a, Uint8Array.from([0b10101011, 0b01110000]))).toBe(2);
    expect(hamming(a, Uint8Array.from([0b01010101, 0b00001111]))).toBe(16);
  });

  it("hex round-trips", () => {
    const bits = Uint8Array.from({ length: 32 }, (_, i) => (i * 37) % 256);
    expect(hashFromHex(hashToHex(bits))).toEqual(bits);
  });

  it("hashes are correctly sized and stable", () => {
    const px = rgbaImage(1);
    const d = dhash256(px, 240, 336);
    expect(d).toHaveLength(32);
    expect(phash64(px, 240, 336)).toHaveLength(8);
    expect(hamming(d, dhash256(px, 240, 336))).toBe(0);
  });

  it("same image is close; different images are far", () => {
    const a = scanVariantHashes(rgbaImage(3), 240, 336).map(decode);
    const same = catalogHashPair(rgbaImage(3), 240, 336);
    const diff = catalogHashPair(rgbaImage(9), 240, 336);
    expect(variantDistance(a, hashFromHex(same.d), hashFromHex(same.p))).toBe(0);
    expect(variantDistance(a, hashFromHex(diff.d), hashFromHex(diff.p))).toBeGreaterThan(100);
  });

  it("emits 3 scan variants", () => {
    expect(scanVariantHashes(rgbaImage(4), 240, 336)).toHaveLength(3);
  });
});

describe("imageHash (node/sharp decode → isomorphic hasher)", () => {
  it("catalog hash of an image ~matches the scan hash of its recompressed self", async () => {
    const px = rgbaImage(2);
    const jpeg = await jpegFromRGBA(px);
    const degraded = await sharp(jpeg).resize(160).jpeg({ quality: 60 }).toBuffer();

    const catalog = await hashCatalogImage(jpeg);
    const scan = (await hashScanVariants(degraded)).map(decode);
    // Recompression + resize should stay well within the confident band (~<125).
    expect(variantDistance(scan, hashFromHex(catalog.d), hashFromHex(catalog.p))).toBeLessThan(60);
  });

  it("distinct cards stay far apart end-to-end", async () => {
    const scan = (await hashScanVariants(await jpegFromRGBA(rgbaImage(3)))).map(decode);
    const other = await hashCatalogImage(await jpegFromRGBA(rgbaImage(9)));
    expect(variantDistance(scan, hashFromHex(other.d), hashFromHex(other.p))).toBeGreaterThan(100);
  });
});
