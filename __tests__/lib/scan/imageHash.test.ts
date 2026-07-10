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
  hashScanImage,
  hashCatalogImage,
  scanDistance,
} from "@/lib/scan/imageHash";

/** Synthetic card-ish test image: colored gradient blocks, deterministic. */
async function testImage(seed: number, width = 240, height = 336): Promise<Buffer> {
  const channels = 3;
  const px = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      px[i] = (x * 7 + seed * 53) % 256;
      px[i + 1] = (y * 5 + seed * 31) % 256;
      px[i + 2] = ((x + y) * 3 + seed * 17) % 256;
    }
  }
  return sharp(px, { raw: { width, height, channels } }).jpeg().toBuffer();
}

describe("imageHash", () => {
  it("hamming: zero for identical, counts differing bits", () => {
    const a = Uint8Array.from([0b10101010, 0b11110000]);
    const b = Uint8Array.from([0b10101010, 0b11110000]);
    const c = Uint8Array.from([0b10101011, 0b01110000]);
    expect(hamming(a, b)).toBe(0);
    expect(hamming(a, c)).toBe(2);
    expect(hamming(a, Uint8Array.from([0b01010101, 0b00001111]))).toBe(16);
  });

  it("hex encoding round-trips", () => {
    const bits = Uint8Array.from({ length: 32 }, (_, i) => (i * 37) % 256);
    expect(hashFromHex(hashToHex(bits))).toEqual(bits);
  });

  it("produces stable, correctly-sized hashes", async () => {
    const img = await testImage(1);
    const d1 = await dhash256(img);
    const d2 = await dhash256(img);
    const p1 = await phash64(img);
    expect(d1).toHaveLength(32);
    expect(p1).toHaveLength(8);
    expect(hamming(d1, d2)).toBe(0);
  });

  it("same image survives recompression + resize (small distance)", async () => {
    const img = await testImage(2);
    const degraded = await sharp(img).resize(160).jpeg({ quality: 60 }).toBuffer();
    const scan = await hashScanImage(degraded);
    const { d, p } = await hashCatalogImage(img);
    expect(scanDistance(scan, d, p)).toBeLessThan(40);
  });

  it("different images are far apart", async () => {
    const scan = await hashScanImage(await testImage(3));
    const { d, p } = await hashCatalogImage(await testImage(9));
    expect(scanDistance(scan, d, p)).toBeGreaterThan(100);
  });

  it("tolerates a slightly loose crop via inset variants", async () => {
    const img = await testImage(4);
    // Simulate a crop that included ~4% background border around the card.
    const meta = await sharp(img).metadata();
    const padded = await sharp({
      create: { width: meta.width! + 20, height: meta.height! + 28, channels: 3, background: "#222222" },
    })
      .composite([{ input: img, left: 10, top: 14 }])
      .jpeg()
      .toBuffer();
    const scanPadded = await hashScanImage(padded);
    const { d, p } = await hashCatalogImage(img);
    const scanExact = await hashScanImage(img);
    // The inset variant should get much closer than a no-variant full-frame hash would.
    expect(scanDistance(scanPadded, d, p)).toBeLessThan(scanDistance(scanExact, d, p) + 100);
    expect(scanDistance(scanPadded, d, p)).toBeLessThan(120);
  });
});
