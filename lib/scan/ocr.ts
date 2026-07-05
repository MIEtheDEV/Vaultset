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

/**
 * OCR an image (File/Blob from a capture input, or an image URL) into raw text
 * plus per-line text. onProgress reports recognition progress 0–100.
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
    const { data } = await worker.recognize(image, {}, { blocks: true });

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
