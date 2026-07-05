"use client";

// Browser-side OCR for the card scanner. tesseract.js is heavy (worker + wasm +
// language data, fetched from CDN on first run), so it's dynamically imported only
// when a scan actually happens — it never lands in the main bundle. Runs entirely
// on the user's device: $0 at any volume, the free Tier-1 identity path.

export interface OcrResult {
  text: string;
  lines: string[];
}

// Minimal shape of the tesseract.js block hierarchy we traverse for line text.
interface OcrNode {
  text?: string;
  lines?: { text?: string }[];
  blocks?: OcrNode[];
  paragraphs?: OcrNode[];
  children?: OcrNode[];
}

// Preprocess a captured image for OCR: normalize size (upscale small shots so the
// small text has enough pixels; cap huge ones for memory), grayscale, and boost
// contrast. Helps Tesseract on foil/low-contrast phone photos. Falls back to the
// raw blob if anything fails, so OCR still runs. EXIF orientation is respected.
async function preprocess(blob: Blob): Promise<HTMLCanvasElement | Blob> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const longer = Math.max(bmp.width, bmp.height);
    const target = 1600;
    const scale = longer < target ? target / longer : longer > 2400 ? 2400 / longer : 1;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bmp, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const c = Math.max(0, Math.min(255, (g - 128) * 1.3 + 128)); // contrast around mid-gray
      d[i] = d[i + 1] = d[i + 2] = c;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  } catch {
    return blob;
  }
}

/**
 * OCR an image (File/Blob from a capture input, or an image URL) into raw text
 * plus per-line text. onProgress reports recognition progress 0–100.
 */
export async function ocrImage(
  image: Blob | string,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> {
  const input = typeof image === "string" ? image : await preprocess(image);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && m.status === "recognizing text") onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(input, {}, { blocks: true });

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
    return {
      text,
      lines: lines.length ? lines : text.split("\n").map((l) => l.trim()).filter(Boolean),
    };
  } finally {
    await worker.terminate();
  }
}
