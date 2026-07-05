// Perspective correction for the card scanner. A phone photo of a card is a
// quadrilateral (shot at an angle); OCR wants a flat, front-on rectangle. Given
// the card's 4 corners in the photo, we solve the projective homography and warp
// the quad to a clean rectangle. Pure math + ImageData — no DOM, no deps, $0.

export type Pt = [number, number];

// Gaussian elimination with partial pivoting. Solves A·x = b for x (n×n).
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[max][i])) max = r;
    [A[i], A[max]] = [A[max], A[i]];
    [b[i], b[max]] = [b[max], b[i]];
    const piv = A[i][i] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r][i] / piv;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  return b.map((v, i) => v / (A[i][i] || 1e-12));
}

/**
 * 3×3 homography (row-major, 9 values, h8=1) mapping the `from` quad onto the
 * `to` quad. Each is 4 points in the same corner order.
 */
export function getHomography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [X, Y] = to[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Apply a homography to a point. */
export function applyH(H: number[], x: number, y: number): Pt {
  const d = H[6] * x + H[7] * y + H[8] || 1e-12;
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
}

/**
 * Warp the source-image quadrilateral (`quad`, in source pixel coords, corner
 * order TL,TR,BR,BL) to a flat outW×outH rectangle. Inverse-maps each output
 * pixel to the source and bilinearly samples.
 */
export function warpQuadToRect(src: ImageData, quad: Pt[], outW: number, outH: number): ImageData {
  const rect: Pt[] = [[0, 0], [outW, 0], [outW, outH], [0, outH]];
  const H = getHomography(rect, quad); // output rect → source quad
  const out = new ImageData(outW, outH);
  const s = src.data, o = out.data, sw = src.width, sh = src.height;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = applyH(H, x + 0.5, y + 0.5);
      const oi = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        o[oi] = o[oi + 1] = o[oi + 2] = 255; // white fill outside the card
        o[oi + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const base00 = (y0 * sw + x0) * 4;
      const base01 = base00 + sw * 4;
      for (let c = 0; c < 4; c++) {
        const top = s[base00 + c] * (1 - fx) + s[base00 + 4 + c] * fx;
        const bot = s[base01 + c] * (1 - fx) + s[base01 + 4 + c] * fx;
        o[oi + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return out;
}
