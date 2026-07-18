"use client";

import { useId } from "react";
import { getRaritySystem } from "@/lib/rarity";
import type { RaritySymbolInfo, RaritySymbolShape, RaritySymbolColor } from "@/lib/rarity";

// Renders a Pokémon rarity symbol as inline SVG — the mark stamped next to a
// card's rarity name. Shape + color come from the RaritySystem (single source of
// truth); this file owns only the drawing. "black" uses currentColor so it stays
// legible in both themes; gold / silver / two-tone render as gradients.

// ── Geometry ──────────────────────────────────────────────────────────────────
const H = 18;          // shape box height (SVG units)
const GAP = 2;         // gap between tiled stars

function polygonPath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
}

function starPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const pts: [number, number][] = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + i * step;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return polygonPath(pts);
}

// A 4-pointed "sparkle" starburst — long cardinal points, short diagonals.
function burstPath(cx: number, cy: number, outer: number, inner: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + i * (Math.PI / 4);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return polygonPath(pts);
}

function diamondPath(cx: number, cy: number, w: number, h: number): string {
  return polygonPath([[cx, cy - h], [cx + w, cy], [cx, cy + h], [cx - w, cy]]);
}

/** Number of tiled shapes for a given shape. */
function tileCount(shape: RaritySymbolShape): number {
  if (shape === "double_star") return 2;
  if (shape === "triple_star") return 3;
  return 1;
}

// ── Fill / stroke resolution ──────────────────────────────────────────────────
function fillFor(color: RaritySymbolColor, gid: string): { fill: string; stroke?: string; strokeWidth?: number } {
  switch (color) {
    case "black":    return { fill: "currentColor" };
    case "gold":     return { fill: `url(#${gid}-gold)`,    stroke: "#8a6d1f", strokeWidth: 0.6 };
    case "silver":   return { fill: `url(#${gid}-silver)`,  stroke: "#7c828c", strokeWidth: 0.7 };
    case "two_tone": return { fill: `url(#${gid}-twotone)`, stroke: "#c98aa8", strokeWidth: 0.6 };
    case "rainbow":  return { fill: `url(#${gid}-rainbow)`, stroke: "#8a8f98", strokeWidth: 0.4 };
    case "magenta":  return { fill: "#d6249f" };
  }
}

function Defs({ color, gid }: { color: RaritySymbolColor; gid: string }) {
  if (color === "gold")
    return (
      <defs>
        <linearGradient id={`${gid}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#e6b426" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
      </defs>
    );
  if (color === "silver")
    return (
      <defs>
        <linearGradient id={`${gid}-silver`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#dce0e5" />
          <stop offset="100%" stopColor="#9aa1ab" />
        </linearGradient>
      </defs>
    );
  if (color === "two_tone")
    return (
      <defs>
        <linearGradient id={`${gid}-twotone`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f7b6d2" />
          <stop offset="50%" stopColor="#f7b6d2" />
          <stop offset="50%" stopColor="#a7e3c0" />
          <stop offset="100%" stopColor="#a7e3c0" />
        </linearGradient>
      </defs>
    );
  if (color === "rainbow")
    return (
      <defs>
        <linearGradient id={`${gid}-rainbow`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="25%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#34d399" />
          <stop offset="75%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
    );
  return null;
}

function shapeElements(shape: RaritySymbolShape, paint: ReturnType<typeof fillFor>) {
  const n = tileCount(shape);
  const unitW = H;
  const cy = H / 2;

  if (shape === "circle")
    return <circle cx={H / 2} cy={cy} r={H * 0.42} {...paint} />;

  if (shape === "diamond")
    return <path d={diamondPath(H / 2, cy, H * 0.4, H * 0.48)} {...paint} strokeLinejoin="round" />;

  if (shape === "starburst")
    return <path d={burstPath(H / 2, cy, H * 0.5, H * 0.16)} {...paint} strokeLinejoin="round" />;

  if (shape === "ace_badge")
    // Stylized ACE SPEC text block — a magenta chip with a bright "A".
    return (
      <>
        <rect x="1" y="2.5" width={H - 2} height={H - 5} rx="3.5" {...paint} />
        <text
          x={H / 2}
          y={cy + 3.2}
          textAnchor="middle"
          fontSize="9"
          fontWeight="800"
          fill="#ffffff"
          fontFamily="system-ui, sans-serif"
        >
          A
        </text>
      </>
    );

  // 1–3 tiled 5-pointed stars
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <path
          key={i}
          d={starPath(i * (unitW + GAP) + unitW / 2, cy, H * 0.5, H * 0.21)}
          {...paint}
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}

export interface RaritySymbolProps {
  rarity: string;
  game?: string;
  /** Explicit symbol; skips the RaritySystem lookup (rarely needed). */
  symbol?: RaritySymbolInfo | null;
  className?: string;
  title?: string;
}

/** The bare symbol, sized to ~1em so it sits inline with text. */
export function RaritySymbol({ rarity, game = "pokemon", symbol, className, title }: RaritySymbolProps) {
  const gid = useId().replace(/:/g, "");
  const info = symbol ?? getRaritySystem(game).getSymbol(rarity);
  if (!info) return null;

  const n = tileCount(info.shape);
  const width = n * H + (n - 1) * GAP;
  const paint = fillFor(info.color, gid);

  return (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      role="img"
      aria-label={title ? `${title} symbol` : "rarity symbol"}
      className={className}
      style={{ height: "1em", width: `${(width / H).toFixed(3)}em`, flex: "none", verticalAlign: "-0.14em" }}
    >
      <Defs color={info.color} gid={gid} />
      {shapeElements(info.shape, paint)}
    </svg>
  );
}

export interface RarityLabelProps {
  rarity: string;
  game?: string;
  className?: string;
}

/** Symbol followed by the rarity title — the standard way to show a rarity. */
export function RarityLabel({ rarity, game = "pokemon", className }: RarityLabelProps) {
  const system = getRaritySystem(game);
  const label = system.getDisplayLabel(rarity);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <RaritySymbol rarity={rarity} game={game} title={label} />
      <span>{label}</span>
    </span>
  );
}
