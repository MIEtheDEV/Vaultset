/**
 * Chart colors, mirrored by hand from the `@theme` tokens in `app/globals.css`.
 *
 * Recharts builds SVG presentation attributes in JS, so it can't reliably pick up
 * the CSS custom properties — every chart has always passed literal hexes. This
 * file exists so those literals live in exactly one place: the axis ticks in
 * three separate chart components silently kept the pre-accessibility `#6b7194`
 * muted grey after `globals.css` was lightened to `#858cab` for WCAG AA, and
 * nothing connected the two.
 *
 * If you change a color token in `globals.css`, change it here too.
 */
export const chartTheme = {
  /** --color-foreground-muted — axis labels, tick text */
  axis: "#858cab",
  /** --color-border — grid lines, cursor, reference lines */
  grid: "#1e2440",
  /** --color-surface — tooltip background, active-dot stroke */
  surface: "#0f1424",
  /** --color-gold — primary series */
  accent: "#e8b84b",
  /** --color-success — gains */
  success: "#34d399",
  /** --color-danger — losses */
  danger: "#f87171",
} as const;

/**
 * Ordinal gold ramp, dim → bright, for dimensions whose order carries meaning
 * (rarity tier, card condition). One hue with monotone lightness, so the reader
 * sees the sequence in the colour itself — never a categorical palette, which
 * would spend the identity channel re-encoding what bar length already shows.
 *
 * Direction is dim → bright because the app renders on a dark surface: on a dark
 * ground, "more" reads as brighter. Index it in reverse for rarest-first lists.
 *
 * Validated (not eyeballed) against the app's `--color-surface` #0f1424 as an
 * ordinal ramp: monotone lightness, every adjacent ΔL ≥ 0.06, single hue (6° of
 * spread), and the dim end still clears the surface at 2.72:1.
 *
 * NOTE: this ramp is specific to a dark surface. On a light ground the bright end
 * lands at 1.80:1 and fails — if a light theme ever ships, the ramp must be
 * re-stepped, not flipped.
 */
export const ORDINAL_GOLD = [
  "#6b5a2a",
  "#8a7433",
  "#a98e3c",
  "#c8a344",
  "#e8b84b",
] as const;

/**
 * Pick a ramp step for position `i` of `n`, brightest first.
 *
 * Used for rarity, where the list runs rarest → commonest: the chase cards get the
 * strongest colour. Collapses to the brand gold when there is only one row.
 */
export function ordinalGoldStep(i: number, n: number): string {
  if (n <= 1) return ORDINAL_GOLD[ORDINAL_GOLD.length - 1];
  const t = i / (n - 1); // 0 = first (brightest) … 1 = last (dimmest)
  const idx = Math.round((1 - t) * (ORDINAL_GOLD.length - 1));
  return ORDINAL_GOLD[idx];
}
