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
