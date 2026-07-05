"use client";

import { useEffect, useRef, useState } from "react";
import { ocrImage } from "@/lib/scan/ocr";
import { CardCropper } from "@/components/CardCropper";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

// Admin-only, beta. Capture a card photo → OCR its body text on-device → fingerprint
// match to the card DB → tap the right printing. Emits the same card shape the add
// form's manual search does, so it plugs straight into handlePokemonSelect.
// Free Tier-1 identity path — see docs/card-scanning-research.md.

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

type Status = "idle" | "cropping" | "reading" | "matching" | "done" | "error";

interface ScanDebug {
  nameCandidates: string[];
  poolSize: number;
  justtcgAppended: number;
  top: { name: string; set: string; number: string; score: number }[];
}

interface Props {
  onSelect: (card: ScannedCard) => void;
}

export function CardScanner({ onSelect }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [candidates, setCandidates] = useState<ScannedCard[]>([]);
  const [confident, setConfident] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [debug, setDebug] = useState<ScanDebug | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // UI gate: only render for admins. The /api/card-scan POST enforces this
  // authoritatively too, so this is just to hide the entry point.
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
    setProgress(0);
    setCandidates([]);
    setConfident(false);
    setErrorMsg("");
    setFile(null);
    setOcrText("");
    setDebug(null);
    if (preview) { URL.revokeObjectURL(preview); setPreview(null); }
    if (fileRef.current) fileRef.current.value = "";
  }

  // A photo was captured — hand it to the cropper first (crop guide + perspective
  // correction) before OCR, so angled/cluttered phone shots get rectified.
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCandidates([]);
    setConfident(false);
    setErrorMsg("");
    setProgress(0);
    if (preview) { URL.revokeObjectURL(preview); setPreview(null); }
    setFile(f);
    setStatus("cropping");
  }

  // Runs on the rectified (or full) image the cropper hands back.
  async function runPipeline(blob: Blob) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(blob));
    setProgress(0);
    try {
      setStatus("reading");
      const { text, lines } = await ocrImage(blob, setProgress);
      setOcrText(text);
      if (!text.trim()) {
        setCandidates([]);
        setStatus("done");
        return;
      }
      setStatus("matching");
      const res = await fetch("/api/card-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lines, bytes: blob.size }),
      });
      if (!res.ok) throw new Error(res.status === 403 ? "Not authorized." : `Scan failed (${res.status}).`);
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

  function pick(card: ScannedCard) {
    onSelect(card);
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
          <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Beta · Admin</span>
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

          {status === "cropping" && file ? (
            <CardCropper file={file} onCropped={runPipeline} onCancel={reset} />
          ) : (
          <>
          <div className="flex items-start gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Scanned card" className="h-28 w-20 rounded-lg object-cover border border-border shrink-0" />
            ) : null}

            <div className="min-w-0 flex-1 space-y-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={status === "reading" || status === "matching"}
                className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
              >
                {preview ? "Retake / choose another" : "Take photo or upload"}
              </button>

              {status === "reading" && (
                <p className="text-xs text-foreground-muted">Reading card… {progress}%</p>
              )}
              {status === "matching" && (
                <p className="text-xs text-foreground-muted">Matching…</p>
              )}
              {status === "error" && (
                <p className="text-xs text-red-400">{errorMsg}</p>
              )}
              {status === "idle" && !preview && (
                <p className="text-xs text-foreground-muted">
                  Point at the card’s name &amp; attacks. We identify the card; you confirm the exact printing.
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
                      onClick={() => pick(card)}
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
              Couldn’t identify the card. Try a sharper, straight-on photo — or use the search below.
            </p>
          )}

          {(status === "done" || status === "error") && (ocrText || debug) && (
            <details className="mt-1 rounded-lg border border-border bg-surface/50 p-2">
              <summary className="cursor-pointer text-[11px] font-medium text-foreground-muted">Diagnostics (admin)</summary>
              <div className="mt-2 space-y-2 text-[11px] text-foreground-muted">
                {debug && (
                  <div>
                    <p className="font-semibold text-foreground">Name candidates</p>
                    <p className="break-words">{debug.nameCandidates.join(", ") || "—"}</p>
                    <p className="mt-0.5">pool {debug.poolSize} · JustTCG appended {debug.justtcgAppended}</p>
                  </div>
                )}
                {debug && debug.top.length > 0 && (
                  <div>
                    <p className="font-semibold text-foreground">Top matches (score)</p>
                    {debug.top.map((t, i) => (
                      <p key={i} className="truncate">{t.score} · {t.name} · {t.set} #{t.number}</p>
                    ))}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground">OCR text</p>
                  <pre className="whitespace-pre-wrap break-words max-h-40 overflow-auto rounded bg-background/50 p-1.5">{ocrText || "—"}</pre>
                </div>
              </div>
            </details>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
