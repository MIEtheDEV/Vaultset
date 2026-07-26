"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { AchievementCardVisual, type AchievementCardData } from "@/components/AchievementCardVisual";
import { THEME_PICKER, type CardTheme } from "@/lib/shareCardThemes";
import { toast } from "@/components/ui/Toast";

/**
 * Export / share controls for one achievement card.
 *
 * Uses the toast layer from Phase 6.0 rather than the inline auto-clearing
 * message CardStudio still carries — this is the pattern the rest of the app
 * should migrate to, so it starts here rather than copying the old one forward.
 */
export function AchievementStudio({
  data,
  initialTheme = "vault",
}: {
  data: AchievementCardData;
  initialTheme?: CardTheme;
}) {
  const [theme, setTheme] = useState<CardTheme>(initialTheme);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.download = `vaultset-${data.badge.slug}-${data.username}.png`;
      a.href = url;
      a.click();
      toast.success("Image saved", { description: `${data.badge.label} card downloaded.` });
    } catch {
      toast.error("Couldn't generate the image", {
        description: "A screenshot of the card works as a fallback.",
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    const shareUrl = `${data.profileUrl}/achievement/${data.badge.slug}`;
    const title = `I unlocked ${data.badge.label} on Vaultset`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        // Share sheet dismissed, or unavailable — fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-10 items-start">
      <div className="flex w-full flex-shrink-0 justify-center lg:w-auto">
        <AchievementCardVisual data={data} theme={theme} cardRef={cardRef} />
      </div>

      <div className="w-full max-w-sm flex-1 space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground-muted">Theme</p>
          <div className="flex gap-2">
            {THEME_PICKER.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                aria-pressed={theme === t.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  theme === t.id
                    ? "border-gold text-gold bg-gold/5"
                    : "border-border text-foreground-muted hover:text-foreground"
                }`}
              >
                <span
                  className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-white/10"
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

        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="w-full rounded-full bg-gold px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-gold-light disabled:opacity-60"
          >
            {downloading ? "Generating…" : "Download PNG"}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
          >
            Share
          </button>
        </div>

        <p className="text-xs leading-relaxed text-foreground-muted">
          The QR code links back to your public profile, so anyone who sees the card can find
          your collection.
        </p>
      </div>
    </div>
  );
}
