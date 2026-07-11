"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CardCropper } from "@/components/CardCropper";
import { CardCameraCapture } from "@/components/CardCameraCapture";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { scanVariantHashes, type HashPair } from "@/lib/scan/perceptualHash";

// Capture a card photo → crop/perspective-correct it → compute its perceptual
// hashes ON-DEVICE (canvas, no native module) → send the hashes to
// /api/card-scan, which compares them against every known card image and
// returns candidate printings → tap the right one. Emits the same card shape
// the add form's manual search does, so it plugs straight into
// handlePokemonSelect. See docs/card-scanning-research.md.

interface ScannedCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  subtypes?: string[];
  set: { id: string; name: string };
  images: { small: string; large: string };
  tcgplayer?: TcgPlayerData | null;
}

type Status = "idle" | "camera" | "cropping" | "matching" | "done" | "error";

interface ScanDebug {
  matchedVia?: string;
  bestDistance?: number | null;
  bestDistanceFirstFrame?: number | null;
  nFrames?: number;
  margin?: number | null;
  indexSize?: number;
  indexBuiltAt?: string | null;
  top?: { id: string; name: string; set: string; number: string; dist: number }[];
}

interface Props {
  onSelect: (card: ScannedCard, index: number) => void;
}

// Long edge the source is scaled to before hashing. Must match the index
// builder's WORK_EDGE (lib/scan/imageHash.ts) so client and catalog hashes are
// computed at the same working resolution.
const WORK_EDGE = 256;

/** Draw the cropped card onto a canvas (capped to WORK_EDGE long edge) and
 *  return both its perceptual hash variants and a small JPEG for admin logging. */
async function hashAndPreview(blob: Blob): Promise<{ hashes: HashPair[]; image: string; bytes: number }> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, WORK_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, w, h);
  const hashes = scanVariantHashes(data, w, h);
  const image = canvas.toDataURL("image/jpeg", 0.82);
  return { hashes, image, bytes: blob.size };
}

export function CardScanner({ onSelect }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [candidates, setCandidates] = useState<ScannedCard[]>([]);
  const [confident, setConfident] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [debug, setDebug] = useState<ScanDebug | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualNum, setManualNum] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // UI gate: only render for signed-in users. The POST enforces this
  // authoritatively too; this just hides the entry point.
  useEffect(() => {
    let alive = true;
    fetch("/api/card-scan")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => { if (alive) setEnabled(!!j.enabled); })
      .catch(() => { /* leave disabled */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function reset() {
    setStatus("idle");
    setCandidates([]);
    setConfident(false);
    setErrorMsg("");
    setFile(null);
    setDebug(null);
    setManualName("");
    setManualNum("");
    if (preview) { URL.revokeObjectURL(preview); setPreview(null); }
    if (fileRef.current) fileRef.current.value = "";
  }

  // Manual refine: the matcher couldn't confidently place the photo (or matched
  // the wrong printing) — the user types the name/number they can see.
  async function manualFind() {
    const name = (manualName || candidates[0]?.name || "").trim();
    const number = manualNum.trim();
    if (!name || !number) return;
    setManualBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/card-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, number }),
      });
      if (!res.ok) throw new Error(res.status === 403 ? "Not authorized." : `Lookup failed (${res.status}).`);
      const json = await res.json();
      setCandidates(json.candidates ?? []);
      setConfident(!!json.confident);
      setStatus("done");
    } catch (err) {
      setErrorMsg((err as Error).message || "Lookup failed.");
    } finally {
      setManualBusy(false);
    }
  }

  // A photo was captured — hand it to the cropper first (crop guide + perspective
  // correction). The warp is what makes image matching reliable on angled shots.
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCandidates([]);
    setConfident(false);
    setErrorMsg("");
    if (preview) { URL.revokeObjectURL(preview); setPreview(null); }
    setFile(f);
    setStatus("cropping");
  }

  // Shared submit: on-device hashes → server match. Used by both the camera
  // burst and the upload/crop fallback.
  async function submitHashes(hashes: HashPair[], image: string, bytes: number) {
    try {
      setStatus("matching");
      const res = await fetch("/api/card-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashes, image, bytes }),
      });
      if (!res.ok) {
        const msg = res.status === 422
          ? "Couldn't read that image — try another photo."
          : res.status === 403 ? "Not authorized." : `Scan failed (${res.status}).`;
        throw new Error(msg);
      }
      const json = await res.json();
      setCandidates(json.candidates ?? []);
      setConfident(!!json.confident);
      setDebug(json.debug ?? null);
      setStatus("done");
    } catch (err) {
      setErrorMsg((err as Error).message || "Something went wrong.");
      setStatus("error");
    }
  }

  // Camera burst finished — show its middle frame as the preview, then match.
  function handleCameraCaptured(hashes: HashPair[], previewDataUrl: string, bytes: number) {
    if (preview) { URL.revokeObjectURL(preview); }
    setPreview(previewDataUrl || null);
    void submitHashes(hashes, previewDataUrl, bytes);
  }

  // Camera couldn't open / was denied — fall back to the upload+crop flow.
  function handleCameraUnavailable(reason: string) {
    setErrorMsg(`${reason} You can upload a photo instead.`);
    setStatus("idle");
  }

  // Runs on the rectified (or full) image the cropper hands back.
  async function runPipeline(blob: Blob) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(blob));
    try {
      const { hashes, image, bytes } = await hashAndPreview(blob);
      await submitHashes(hashes, image, bytes);
    } catch (err) {
      setErrorMsg((err as Error).message || "Something went wrong.");
      setStatus("error");
    }
  }

  function pick(card: ScannedCard, index: number) {
    onSelect(card, index);
    setOpen(false);
    reset();
  }

  if (!enabled) return null;

  return (
    <div className="mb-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gold/40 bg-gold/5 px-4 py-3 text-sm font-medium text-gold hover:bg-gold/10 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Scan a card
          <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Beta</span>
        </button>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-raised p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Scan a card</p>
            <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-xs text-foreground-muted hover:text-foreground transition-colors">
              Close
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />

          {status === "idle" && !preview && (
            <ol className="space-y-1.5 text-xs text-foreground-muted">
              <li><span className="font-semibold text-foreground">1. Lay the card flat</span> on a table, front side up, under even light.</li>
              <li><span className="font-semibold text-foreground">2. Fill the guide &amp; tap Capture.</span> We grab several frames to see past holo glare — tilt slightly if you spot a reflection.</li>
              <li><span className="font-semibold text-foreground">3. Confirm.</span> We match it against every known card and show the printing.</li>
            </ol>
          )}

          {status === "camera" ? (
            <CardCameraCapture
              onCaptured={handleCameraCaptured}
              onUnavailable={handleCameraUnavailable}
              onCancel={reset}
            />
          ) : status === "cropping" && file ? (
            <CardCropper file={file} onCropped={runPipeline} onCancel={reset} />
          ) : (
          <>
          <div className="flex items-start gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Scanned card" className="h-28 w-20 rounded-lg object-cover border border-border shrink-0" />
            ) : null}

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setErrorMsg(""); setStatus("camera"); }}
                  disabled={status === "matching"}
                  className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
                >
                  {preview ? "Scan another (camera)" : "Scan with camera"}
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={status === "matching"}
                  className="rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground-muted hover:text-foreground hover:border-gold/40 disabled:opacity-60 transition-colors"
                >
                  Upload a photo
                </button>
              </div>

              {status === "matching" && (
                <p className="text-xs text-foreground-muted">Matching…</p>
              )}
              {status === "error" && (
                <p className="text-xs text-red-400">{errorMsg}</p>
              )}
              {status === "idle" && !preview && (
                <p className="text-xs text-foreground-muted">
                  Fill the guide with the card and we&apos;ll identify the exact printing.
                </p>
              )}
            </div>
          </div>

          {status === "done" && candidates.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground-muted">
                {confident ? "Best match — tap to confirm the printing:" : "Possible matches — tap the right one:"}
              </p>
              <ul className="rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border">
                {candidates.map((card, i) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => pick(card, i)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-raised transition-colors ${i === 0 && confident ? "bg-gold/5" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.images.small} alt={card.name} className="h-10 w-7 rounded object-cover shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{card.name}</p>
                        <p className="text-xs text-foreground-muted truncate">
                          {card.set.name} · #{card.number}{card.rarity ? ` · ${card.rarity}` : ""}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {status === "done" && candidates.length === 0 && (
            <p className="text-xs text-foreground-muted">
              Couldn&apos;t identify the card. Try retaking with the corners lined up on the card&apos;s
              edges — or type the card&apos;s name and number below.
            </p>
          )}

          {status === "done" && (
            <div className="rounded-lg border border-border/60 bg-surface/40 p-2 space-y-1.5">
              <p className="text-[11px] text-foreground-muted">
                Wrong or missing printing (e.g. a foil/promo)? Type the card&apos;s name and number:
              </p>
              <div className="flex gap-2">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder={candidates[0]?.name || "Card name"}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-muted"
                />
                <input
                  value={manualNum}
                  onChange={(e) => setManualNum(e.target.value)}
                  placeholder="# 079"
                  inputMode="numeric"
                  className="w-20 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-muted"
                />
                <button
                  type="button"
                  onClick={manualFind}
                  disabled={manualBusy || !manualNum.trim()}
                  className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
                >
                  {manualBusy ? "…" : "Find"}
                </button>
              </div>
            </div>
          )}

          {(status === "done" || status === "error") && debug && (
            <details className="mt-1 rounded-lg border border-border bg-surface/50 p-2">
              <summary className="cursor-pointer text-[11px] font-medium text-foreground-muted">Scan details</summary>
              <div className="mt-2 space-y-2 text-[11px] text-foreground-muted">
                <p>
                  distance {debug.bestDistance ?? "—"} · margin {debug.margin ?? "—"} · index {debug.indexSize ?? "—"} cards
                </p>
                <p>
                  frames {debug.nFrames ?? "—"} · 1-frame distance {debug.bestDistanceFirstFrame ?? "—"}
                  {typeof debug.bestDistance === "number" && typeof debug.bestDistanceFirstFrame === "number"
                    ? ` (burst helped by ${debug.bestDistanceFirstFrame - debug.bestDistance})`
                    : ""}
                </p>
                {debug.top && debug.top.length > 0 && (
                  <div>
                    <p className="font-semibold text-foreground">Closest matches (distance)</p>
                    {debug.top.map((t, i) => (
                      <p key={i} className="truncate">{t.dist} · {t.name} · {t.set} #{t.number}</p>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
          </>
          )}

          <p className="border-t border-border/60 pt-2 text-[11px] leading-relaxed text-foreground-muted/80">
            Beta — this feature is still being tested. If a scan gets the wrong printing, enter the
            card number above before saving. You can also send feedback after adding the card, or reach
            us anytime via our{" "}
            <Link href="/contact" className="text-gold hover:text-gold-light transition-colors">contact page</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
