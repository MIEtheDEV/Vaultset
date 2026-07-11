"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scanVariantHashes, type HashPair } from "@/lib/scan/perceptualHash";

// Live-camera card capture. Two jobs, matching the two real-world failure modes
// of single-photo scanning:
//   1. Geometry — a card-shaped guide overlay. The user fills it with the card,
//      so the capture is framed flat and axis-aligned (no hand-drawn crop, which
//      is the step casual users skip → the #1 cause of failed scans).
//   2. Glare — capture a short BURST of frames. Holofoil reflection shifts frame
//      to frame; hashing all of them and matching the best defeats the glare that
//      kills a single still.
// The video is shown at its natural aspect (no object-fit crop) so the CSS guide
// and the pixel crop line up without fragile coordinate math. Falls back to the
// upload/crop flow (onUnavailable) when the camera can't be opened.

const CARD_W = 5, CARD_H = 7;   // trading-card aspect (2.5" × 3.5")
const FRAME_MARGIN = 0.92;      // crop/guide width as a fraction of the frame width
const BURST = 10;               // frames per capture — more frames = more chances to
const BURST_INTERVAL_MS = 170;  // catch a low-glare frame (the deciding factor in testing)

interface Props {
  onCaptured: (hashes: HashPair[], previewDataUrl: string, bytes: number) => void;
  onUnavailable: (reason: string) => void;
  onCancel: () => void;
}

/** Centered card-aspect crop rect within a frame of vw×vh. Matches the CSS guide. */
function cropRect(vw: number, vh: number) {
  let cw = vw * FRAME_MARGIN;
  let ch = cw * (CARD_H / CARD_W);
  if (ch > vh * FRAME_MARGIN) {
    ch = vh * FRAME_MARGIN;
    cw = ch * (CARD_W / CARD_H);
  }
  return { cx: (vw - cw) / 2, cy: (vh - ch) / 2, cw, ch };
}

export function CardCameraCapture({ onCaptured, onUnavailable, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onUnavailable("Camera not available on this device.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => { /* autoplay policies — user gesture already occurred */ });
          setReady(true);
        }
      } catch (e) {
        const name = (e as Error)?.name;
        onUnavailable(
          name === "NotAllowedError"
            ? "Camera permission was denied."
            : "Couldn't open the camera.",
        );
      }
    })();
    return () => { alive = false; stop(); };
  }, [onUnavailable, stop]);

  async function grabFrame(): Promise<{ hashes: HashPair[]; preview?: string; bytes?: number } | null> {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const { cx, cy, cw, ch } = cropRect(v.videoWidth, v.videoHeight);
    // Downscale the crop to the hashing working size (~256 long edge).
    const scale = Math.min(1, 256 / Math.max(cw, ch));
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, cx, cy, cw, ch, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const hashes = scanVariantHashes(data, w, h);
    const preview = canvas.toDataURL("image/jpeg", 0.82);
    return { hashes, preview, bytes: Math.round((preview.length * 3) / 4) };
  }

  async function capture() {
    if (!ready || capturing) return;
    setCapturing(true);
    const all: HashPair[] = [];
    let preview = "";
    let bytes = 0;
    try {
      for (let i = 0; i < BURST; i++) {
        const f = await grabFrame();
        if (f) {
          all.push(...f.hashes);
          if (i === Math.floor(BURST / 2) && f.preview) { preview = f.preview; bytes = f.bytes ?? 0; }
        }
        if (i < BURST - 1) await new Promise((r) => setTimeout(r, BURST_INTERVAL_MS));
      }
      stop();
      if (all.length === 0) {
        onUnavailable("Couldn't read frames from the camera.");
        return;
      }
      // Cap defensively (server accepts a bounded number of hash pairs).
      onCaptured(all.slice(0, 36), preview, bytes);
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground-muted">
        Lay the card flat on a table, fill the frame with it, and tap Capture. Holo cards read best
        flat under even light — tilt slightly if you see a reflection.
      </p>
      <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} playsInline muted className="block w-full h-auto" />
        {/* Card-shaped guide — matches the centered card-aspect crop in grabFrame.
            Anchored on WIDTH (height follows the 5:7 card ratio) so the box stays
            correctly proportioned on portrait phone video, where forcing height
            broke the aspect and made the guide too tall. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-lg border-2 border-gold/90 shadow-[0_0_0_2000px_rgba(0,0,0,0.35)]"
            style={{ aspectRatio: "5 / 7", width: "92%", maxHeight: "92%" }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={capture}
          disabled={!ready || capturing}
          className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
        >
          {capturing ? "Capturing…" : ready ? "Capture" : "Starting camera…"}
        </button>
        <button
          type="button"
          onClick={() => { stop(); onCancel(); }}
          disabled={capturing}
          className="rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
