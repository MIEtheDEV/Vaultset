// Palettes for the shareable card visuals (profile card, achievement card).
//
// Extracted from ProfileCardVisual so a second shareable card could reuse the
// exact same three themes rather than approximating them — two drifting copies of
// "Vault" would be obvious the moment someone shared both images together.
//
// These are deliberately hardcoded hexes rather than the app's CSS tokens: the
// cards are rasterised to PNG by html-to-image and viewed outside the app, so they
// must not inherit the viewer's theme.

export type CardTheme = "vault" | "holo" | "print";

export type ShareCardPalette = {
  card: { background: string; color: string };
  accent: string;
  muted: string;
  border: string;
  divider: string;
  artBg: string;
  footerBg: string;
  badgeBg: string;
  badgeBorder: string;
  qrFg: string;
  qrBg: string;
  valueText: string;
  labelText: string;
};

export const SHARE_CARD_THEMES: Record<CardTheme, ShareCardPalette> = {
  vault: {
    card:        { background: "#0f0f0f", color: "#e5e5e5" },
    accent:      "#d4a72c",
    muted:       "#9ca3af",
    border:      "rgba(212,167,44,0.2)",
    divider:     "rgba(212,167,44,0.12)",
    artBg:       "#1a1a1a",
    footerBg:    "#0c0c0c",
    badgeBg:     "rgba(212,167,44,0.10)",
    badgeBorder: "rgba(212,167,44,0.28)",
    qrFg:        "#d4a72c",
    qrBg:        "#0f0f0f",
    valueText:   "#f5f5f5",
    labelText:   "#9ca3af",
  },
  holo: {
    card:        { background: "#0c1a2e", color: "#e0f2fe" },
    accent:      "#38bdf8",
    muted:       "#7dd3fc",
    border:      "rgba(56,189,248,0.2)",
    divider:     "rgba(56,189,248,0.12)",
    artBg:       "#0a1628",
    footerBg:    "#070e1c",
    badgeBg:     "rgba(56,189,248,0.10)",
    badgeBorder: "rgba(56,189,248,0.28)",
    qrFg:        "#38bdf8",
    qrBg:        "#0c1a2e",
    valueText:   "#e0f2fe",
    labelText:   "#7dd3fc",
  },
  print: {
    card:        { background: "#ffffff", color: "#111827" },
    accent:      "#111827",
    muted:       "#6b7280",
    border:      "#e5e7eb",
    divider:     "#e5e7eb",
    artBg:       "#f3f4f6",
    footerBg:    "#f9fafb",
    badgeBg:     "#f3f4f6",
    badgeBorder: "#d1d5db",
    qrFg:        "#111827",
    qrBg:        "#ffffff",
    valueText:   "#111827",
    labelText:   "#6b7280",
  },
};

/** The rainbow edge the "holo" theme wraps its card in. */
export const HOLO_EDGE =
  "conic-gradient(from 180deg at 50% 50%, #ff0080 0deg, #ff8c00 50deg, #ffd700 90deg, #00ff88 140deg, #00ccff 180deg, #8b5cf6 230deg, #ff0080 360deg)";

export const THEME_PICKER: { id: CardTheme; label: string; swatch: string }[] = [
  { id: "vault", label: "Vault", swatch: "#0f0f0f" },
  { id: "holo",  label: "Holo",  swatch: "holo"    },
  { id: "print", label: "Print", swatch: "#ffffff" },
];
