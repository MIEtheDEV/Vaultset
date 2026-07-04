import Link from "next/link";
import type { Change } from "@/lib/priceHistory";

// Inline "ticker" showing a card's market-value change since the previous day's
// snapshot. Renders nothing when there is no prior day to compare against, so
// callers can drop it in unconditionally. When `href` is provided it becomes a
// link (e.g. to the value-over-time chart).
export function DailyChange({
  change,
  className = "",
  href,
}: {
  change: Change | null;
  className?: string;
  href?: string;
}) {
  if (!change) return null;

  const up = change.abs > 0;
  const down = change.abs < 0;
  const color = up ? "text-emerald-400" : down ? "text-red-400" : "text-foreground-muted";
  const arrow = up ? "▲" : down ? "▼" : "•";
  const sign = change.abs >= 0 ? "+" : "−";
  const abs = Math.abs(change.abs);
  const pct = Math.abs(change.pct);

  const body = (
    <>
      <span aria-hidden>{arrow}</span>
      <span>
        {sign}${abs.toFixed(2)} ({sign}
        {pct.toFixed(1)}%)
      </span>
    </>
  );

  const base = `inline-flex items-center gap-1 text-xs font-medium ${color} ${className}`;

  if (href) {
    return (
      <Link href={href} className={`${base} hover:underline`} title="View value over time">
        {body}
      </Link>
    );
  }
  return (
    <span className={base} title="Change since the previous day">
      {body}
    </span>
  );
}
