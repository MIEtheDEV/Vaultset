"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ProfileCardVisual, type ProfileCardData, type CardTheme } from "@/components/ProfileCardVisual";

const CTA_PRESETS = [
  "Check out my collection",
  "Trade with me!",
  "Cards for sale — scan to browse",
  "Scan to view my profile",
];

const THEME_META: { id: CardTheme; label: string; swatch: string }[] = [
  { id: "vault", label: "Vault", swatch: "#0f0f0f" },
  { id: "holo",  label: "Holo",  swatch: "holo"    },
  { id: "print", label: "Print", swatch: "#ffffff"  },
];

export function CardStudio({
  data,
  initialCta,
  initialTheme,
}: {
  data: ProfileCardData;
  initialCta: string;
  initialTheme: CardTheme;
}) {
  const isPreset = CTA_PRESETS.includes(initialCta);
  const [cta,       setCta]       = useState(isPreset ? initialCta : CTA_PRESETS[0]);
  const [customCta, setCustomCta] = useState(isPreset ? "" : initialCta);
  const [useCustom, setUseCustom] = useState(!isPreset && !!initialCta);
  const [theme,     setTheme]     = useState<CardTheme>(initialTheme);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState("");

  const cardRef = useRef<HTMLDivElement>(null);
  const activeCta = useCustom ? (customCta.trim() || CTA_PRESETS[0]) : cta;

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 2500);
  }

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.download = `vaultset-${data.username}.png`;
      a.href = url;
      a.click();
    } catch {
      flash("Download failed — try a screenshot instead.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    const url = data.profileUrl;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: `@${data.username} on Vaultset`, url }); return; }
      catch {}
    }
    try { await navigator.clipboard.writeText(url); flash("Profile link copied!"); }
    catch { flash("Copy failed."); }
  }

  async function handleCopyCardLink() {
    const params = new URLSearchParams({ cta: activeCta, theme });
    const url = `${data.profileUrl}/card?${params.toString()}`;
    try { await navigator.clipboard.writeText(url); flash("Card link copied!"); }
    catch { flash("Copy failed."); }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-10 items-start">
      {/* Card preview */}
      <div className="flex-shrink-0 flex justify-center w-full lg:w-auto">
        <ProfileCardVisual data={data} cta={activeCta} theme={theme} cardRef={cardRef} />
      </div>

      {/* Controls */}
      <div className="flex-1 space-y-6 max-w-sm w-full">

        {/* Theme */}
        <div>
          <p className="mb-2 text-sm font-medium text-foreground-muted">Theme</p>
          <div className="flex gap-2">
            {THEME_META.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  theme === t.id
                    ? "border-gold text-gold bg-gold/5"
                    : "border-border text-foreground-muted hover:text-foreground"
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-white/10 flex-shrink-0"
                  style={{
                    background:
                      t.swatch === "holo"
                        ? "conic-gradient(from 0deg, #ff0080, #ffd700, #00ff88, #00ccff, #8b5cf6, #ff0080)"
                        : t.swatch,
                    borderColor: t.id === "print" ? "#d1d5db" : undefined,
                  }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div>
          <p className="mb-2 text-sm font-medium text-foreground-muted">Call to Action</p>
          <div className="space-y-2">
            {CTA_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => { setCta(preset); setUseCustom(false); }}
                className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  !useCustom && cta === preset
                    ? "border-gold text-gold bg-gold/5"
                    : "border-border text-foreground-muted hover:text-foreground"
                }`}
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUseCustom(true)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                useCustom
                  ? "border-gold text-gold bg-gold/5"
                  : "border-border text-foreground-muted hover:text-foreground"
              }`}
            >
              Custom message…
            </button>
            {useCustom && (
              <input
                type="text"
                autoFocus
                maxLength={60}
                placeholder="Enter your message (max 60 chars)"
                value={customCta}
                onChange={(e) => setCustomCta(e.target.value)}
                className="w-full rounded-xl border border-gold bg-surface-raised px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="w-full rounded-full bg-gold px-6 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {downloading ? "Generating…" : "Download PNG"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
            >
              Share Profile
            </button>
            <button
              type="button"
              onClick={handleCopyCardLink}
              className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
            >
              Copy Card Link
            </button>
          </div>
          {msg && (
            <p className="text-center text-xs text-emerald-400 pt-1">{msg}</p>
          )}
        </div>
      </div>
    </div>
  );
}
