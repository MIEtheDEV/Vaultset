"use client";

// Browser-side OCR for the card scanner. tesseract.js is heavy (worker + wasm +
// language data, fetched from CDN on first run), so it's dynamically imported only
// when a scan actually happens — it never lands in the main bundle. Runs entirely
// on the user's device: $0 at any volume, the free Tier-1 identity path.

export interface OcrResult {
  text: string;
  lines: string[];
  /** Pokémon-name guesses from a targeted top-banner pass (full-art names). */
  nameHints: string[];
  /** 2–3 digit collector-number guesses from a targeted bottom-strip pass. */
  numberHints: string[];
}

// Minimal shape of the tesseract.js block hierarchy we traverse for line text.
interface OcrNode {
  text?: string;
  lines?: { text?: string }[];
  blocks?: OcrNode[];
  paragraphs?: OcrNode[];
  children?: OcrNode[];
}

interface MiniWorker {
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  recognize: (image: unknown, options?: unknown, output?: unknown) => Promise<{ data: { text?: string } }>;
}

// Grayscale + min-max contrast stretch on ImageData, in place.
function grayNormalize(d: Uint8ClampedArray): void {
  const g = new Float32Array(d.length / 4);
  let min = 255, max = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g[p] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = ((g[p] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

// Full-card canvas for the main OCR pass: normalize size (upscale small shots;
// cap huge ones), grayscale, boost contrast. Helps on foil/low-contrast photos.
function fullCanvas(bmp: ImageBitmap): HTMLCanvasElement | null {
  const longer = Math.max(bmp.width, bmp.height);
  const target = 1600;
  const scale = longer < target ? target / longer : longer > 2400 ? 2400 / longer : 1;
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const c = Math.max(0, Math.min(255, (g - 128) * 1.3 + 128));
    d[i] = d[i + 1] = d[i + 2] = c;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// 2–3 digit runs, deduped, 3-digit first. A run of exactly 2–3 digits is
// digit-bounded, so a 4-digit ©year ("2026") can't fragment into a false number.
function digitTokens(text: string): string[] {
  const toks = (text.match(/\d+/g) ?? []).filter((t) => t.length >= 2 && t.length <= 3);
  return [...new Set(toks)].sort((a, b) => b.length - a.length);
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '";
const NAME_STOP = new Set(["stage", "basic", "evolves", "from"]);

// Targeted name read: crop the top name banner (where the Pokémon name lives),
// upscale, grayscale+normalize, OCR letters. On full-art/holo cards the stylized
// name over busy art defeats the full-card pass (e.g. "Empoleon" → "leon", which
// then matched the Leon trainer). Extract capitalized words (leading cap + ≥3
// lowercase) so the trailing "ex"/logo glyph ("EmpoleonX") doesn't corrupt it.
async function ocrNameStrip(worker: MiniWorker, bmp: ImageBitmap): Promise<string[]> {
  const scale = Math.max(3, Math.round(2000 / bmp.width));
  const sy = Math.round(bmp.height * 0.03);
  const sh = Math.round(bmp.height * 0.085);
  const sw = Math.round(bmp.width * 0.8); // exclude the HP number (top-right)
  const w = sw * scale;
  const h = sh * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(bmp, 0, sy, sw, sh, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  grayNormalize(img.data);
  ctx.putImageData(img, 0, 0);

  const names = new Set<string>();
  for (const psm of ["7", "6"]) {
    await worker.setParameters({ tessedit_char_whitelist: LETTERS, tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(canvas);
    for (const m of (data.text || "").matchAll(/[A-Z][a-z]{3,}/g)) {
      const n = m[0].toLowerCase();
      if (!NAME_STOP.has(n)) names.add(n);
    }
  }
  await worker.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: "3" });
  return [...names].sort((a, b) => b.length - a.length).slice(0, 3);
}

// Targeted collector-number read: crop the bottom strip (where the number lives),
// upscale, grayscale+normalize, OCR with a digit whitelist. Reads the small
// foil/promo number the full-card pass misses (validated on real scans). Two PSM
// passes for robustness; results feed the JustTCG number probe server-side.
async function ocrNumberStrip(worker: MiniWorker, bmp: ImageBitmap): Promise<string[]> {
  const scale = Math.max(3, Math.round(2400 / bmp.width));
  const sy = Math.round(bmp.height * 0.89);
  const sh = bmp.height - sy;
  const w = bmp.width * scale;
  const h = sh * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  grayNormalize(img.data);
  ctx.putImageData(img, 0, 0);

  const found = new Set<string>();
  for (const psm of ["6", "11"]) {
    await worker.setParameters({ tessedit_char_whitelist: "0123456789/", tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(canvas);
    for (const t of digitTokens(data.text || "")) found.add(t);
  }
  // reset so the whitelist can't affect anything else
  await worker.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: "3" });
  return [...found].sort((a, b) => b.length - a.length).slice(0, 4);
}

/**
 * OCR an image (File/Blob from a capture input, or an image URL) into raw text,
 * per-line text, and targeted collector-number guesses. onProgress reports the
 * main recognition progress 0–100.
 */
export async function ocrImage(
  image: Blob | string,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && m.status === "recognizing text") onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    let bmp: ImageBitmap | null = null;
    let mainInput: HTMLCanvasElement | Blob | string = image;
    if (typeof image !== "string") {
      try {
        bmp = await createImageBitmap(image, { imageOrientation: "from-image" });
        mainInput = fullCanvas(bmp) ?? image;
      } catch {
        mainInput = image;
      }
    }

    const { data } = await worker.recognize(mainInput, {}, { blocks: true });

    const lines: string[] = [];
    const walk = (node: OcrNode | OcrNode[] | null | undefined): void => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      node.lines?.forEach((ln) => {
        const t = (ln.text || "").trim();
        if (t) lines.push(t);
      });
      walk(node.blocks);
      walk(node.paragraphs);
      walk(node.children);
    };
    walk(data.blocks as unknown as OcrNode[]);

    const text = data.text || "";
    let nameHints: string[] = [];
    let numberHints: string[] = [];
    if (bmp) {
      const mini = worker as unknown as MiniWorker;
      try { nameHints = await ocrNameStrip(mini, bmp); } catch { /* best-effort */ }
      try { numberHints = await ocrNumberStrip(mini, bmp); } catch { /* best-effort */ }
    }

    return {
      text,
      lines: lines.length ? lines : text.split("\n").map((l) => l.trim()).filter(Boolean),
      nameHints,
      numberHints,
    };
  } finally {
    await worker.terminate();
  }
}
