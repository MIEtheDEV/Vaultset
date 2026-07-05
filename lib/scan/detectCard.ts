"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

// Automatic card-edge detection for the scanner ("scanner mode" feel): find the
// card's 4 corners in a photo so the cropper can pre-place its handles — the user
// just confirms instead of dragging. Uses OpenCV.js, lazy-loaded from CDN (~8MB,
// admin-only), and degrades gracefully to null (cropper falls back to an inset
// default) if it can't load or find a card.

export type Pt = [number, number];

let cvPromise: Promise<any> | null = null;

// Load OpenCV.js once and resolve when its wasm runtime is ready. Polls for
// `cv.Mat` on a hard deadline that starts IMMEDIATELY — not inside script.onload,
// which on mobile may never fire if the 11MB download stalls (that was the "stuck
// on Detecting" hang). On failure the memo is cleared so a later scan can retry.
function loadCv(): Promise<any> {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise<any>((resolve, reject) => {
    const w = window as unknown as { cv?: any };
    if (w.cv && w.cv.Mat) return resolve(w.cv);

    if (!document.getElementById("opencv-js")) {
      const script = document.createElement("script");
      script.id = "opencv-js";
      script.src = "https://docs.opencv.org/4.x/opencv.js";
      script.async = true;
      script.onerror = () => reject(new Error("opencv load failed"));
      document.body.appendChild(script);
    }

    const deadline = Date.now() + 20000;
    const poll = () => {
      if (w.cv && w.cv.Mat) resolve(w.cv);
      else if (Date.now() > deadline) reject(new Error("opencv init timeout"));
      else setTimeout(poll, 100);
    };
    poll();
  }).catch((e) => {
    cvPromise = null; // allow a retry on the next scan
    throw e;
  });
  return cvPromise;
}

// Order 4 points as [TL, TR, BR, BL] using coordinate sums/diffs.
function order(pts: Pt[]): Pt[] {
  const bySum = [...pts].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const byDiff = [...pts].sort((a, b) => a[0] - a[1] - (b[0] - b[1]));
  return [bySum[0], byDiff[byDiff.length - 1], bySum[bySum.length - 1], byDiff[0]];
}

/**
 * Detect the card's 4 corners in `canvas` (in its pixel coords). Returns points
 * ordered TL,TR,BR,BL, or null if no card-like quad is found / OpenCV unavailable.
 */
export async function detectCardCorners(canvas: HTMLCanvasElement): Promise<Pt[] | null> {
  let cv: any;
  try {
    cv = await loadCv();
  } catch {
    return null;
  }

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 50, 150);
    cv.dilate(edges, edges, kernel); // close small gaps in the card outline
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = src.rows * src.cols * 0.2; // card must fill ≥20% of the frame
    let best: Pt[] | null = null;
    let bestArea = minArea;
    let fallback: Pt[] | null = null;
    let fallbackArea = minArea;

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);

      // Rotated-bounding-box fallback for the largest contour (handles rounded
      // corners / imperfect outlines that don't reduce to a clean quad).
      if (area > fallbackArea) {
        const rect = cv.minAreaRect(c);
        const box = cv.RotatedRect.points(rect);
        fallback = order(box.map((p: { x: number; y: number }) => [p.x, p.y] as Pt));
        fallbackArea = area;
      }

      // Preferred: a contour that approximates to exactly 4 corners (a real quad).
      if (area > bestArea) {
        const peri = cv.arcLength(c, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.02 * peri, true);
        if (approx.rows === 4) {
          const pts: Pt[] = [];
          for (let j = 0; j < 4; j++) pts.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]]);
          best = order(pts);
          bestArea = area;
        }
        approx.delete();
      }
      c.delete();
    }

    return best ?? fallback;
  } catch {
    return null;
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
}
