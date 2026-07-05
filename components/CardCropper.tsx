"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { warpQuadToRect, type Pt } from "@/lib/scan/perspective";

// Crop + perspective-correct a captured card photo before OCR. The user drags 4
// corner handles onto the card's edges; on confirm we warp that quad to a flat,
// front-on rectangle — turning an angled/cluttered phone photo into something
// close to the clean scans OCR reads well. All client-side, $0.

const OUT_W = 600;
const OUT_H = 840; // ~5:7 trading-card aspect; enough resolution for the small text
const SRC_CAP = 1600; // cap the working source so mobile memory stays sane

interface Props {
  file: File;
  onCropped: (blob: Blob) => void;
  onCancel: () => void;
}

export function CardCropper({ file, onCropped, onCancel }: Props) {
  const [url, setUrl] = useState("");
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [corners, setCorners] = useState<Pt[]>([]);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const maxW = Math.min(340, boxRef.current?.clientWidth || 340);
    const w = maxW;
    const h = Math.round(img.naturalHeight * (maxW / img.naturalWidth));
    setDisp({ w, h });
    // Card-shaped inset guide — the user drags the corners to the real edges.
    const ix = w * 0.08, iy = h * 0.08;
    setCorners([[ix, iy], [w - ix, iy], [w - ix, h - iy], [ix, h - iy]]);
  }

  const clampToBox = useCallback((x: number, y: number): Pt => [
    Math.max(0, Math.min(disp.w, x)),
    Math.max(0, Math.min(disp.h, y)),
  ], [disp.w, disp.h]);

  function onPointerDown(i: number, e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = i;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragRef.current === null || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const p = clampToBox(e.clientX - rect.left, e.clientY - rect.top);
    const idx = dragRef.current;
    setCorners((c) => c.map((pt, i) => (i === idx ? p : pt)));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || corners.length !== 4) return;
    setBusy(true);
    try {
      const nScale = Math.min(1, SRC_CAP / Math.max(img.naturalWidth, img.naturalHeight));
      const sw = Math.round(img.naturalWidth * nScale);
      const sh = Math.round(img.naturalHeight * nScale);
      const sc = document.createElement("canvas");
      sc.width = sw; sc.height = sh;
      const sctx = sc.getContext("2d");
      if (!sctx) throw new Error("no canvas");
      sctx.drawImage(img, 0, 0, sw, sh);
      const srcData = sctx.getImageData(0, 0, sw, sh);

      // display coords → source-canvas coords
      const dx = sw / disp.w, dy = sh / disp.h;
      const quad: Pt[] = corners.map(([x, y]) => [x * dx, y * dy]);

      const warped = warpQuadToRect(srcData, quad, OUT_W, OUT_H);
      const oc = document.createElement("canvas");
      oc.width = OUT_W; oc.height = OUT_H;
      oc.getContext("2d")?.putImageData(warped, 0, 0);
      const blob = await new Promise<Blob | null>((res) => oc.toBlob((b) => res(b), "image/jpeg", 0.92));
      if (blob) onCropped(blob);
    } finally {
      setBusy(false);
    }
  }

  const polyPoints = corners.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground-muted">Drag the corners to the edges of the card, then confirm.</p>

      <div ref={boxRef} className="relative mx-auto select-none touch-none" style={{ width: disp.w || "auto" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt="Captured card"
          onLoad={onImgLoad}
          className="block w-full rounded-lg"
          style={{ height: disp.h || "auto" }}
          draggable={false}
        />

        {disp.w > 0 && (
          <div
            className="absolute inset-0"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <svg width={disp.w} height={disp.h} className="absolute inset-0 pointer-events-none">
              <polygon points={polyPoints} fill="rgba(212,175,55,0.12)" stroke="#d4af37" strokeWidth={2} />
            </svg>
            {corners.map((c, i) => (
              <div
                key={i}
                onPointerDown={(e) => onPointerDown(i, e)}
                className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold bg-gold/30 cursor-grab active:cursor-grabbing"
                style={{ left: c[0], top: c[1], touchAction: "none" }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={busy || corners.length !== 4}
          className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
        >
          {busy ? "Processing…" : "Use this crop"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
        >
          Retake
        </button>
      </div>
    </div>
  );
}
