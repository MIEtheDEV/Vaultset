import Link from "next/link";
import { BadgeChip } from "@/components/BadgeChip";
import { BADGE_MAP } from "@/lib/badges";
import type { Milestone } from "@/lib/badgeProgress";

/**
 * What you're closest to earning.
 *
 * The badge system has awarded milestones since Phase 2 but never showed anyone
 * the target — a badge just appeared, already earned, as a line in an activity
 * list. This is the other half: something to aim at.
 *
 * Badge rows reuse `BadgeChip` in its existing locked state (dimmed, greyed hex)
 * so a milestone and the badge it becomes are visibly the same object.
 */
export function NextMilestones({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold text-foreground">Next Milestones</h2>
        <Link
          href="/masterset"
          className="text-xs text-foreground-muted hover:text-foreground transition-colors"
        >
          Browse sets →
        </Link>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {milestones.map((m) => (
          <li key={m.key}>
            <MilestoneCard milestone={m} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MilestoneCard({ milestone: m }: { milestone: Milestone }) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        {m.slug ? (
          // Locked state: same hex art the badge will use once earned.
          <span className="shrink-0">
            <BadgeChip badge={BADGE_MAP.get(m.slug)!} earned={false} size="mini" />
          </span>
        ) : (
          <span className="flex h-9 w-8 shrink-0 items-center justify-center text-foreground-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={m.label}>
            {m.label}
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {/*
              Lead with what's left rather than what's done — "4 to go" prompts an
              action in a way "96 of 100" doesn't.
            */}
            <span className="font-medium text-gold">{formatCount(m.remaining)} to go</span>
            <span className="tabular-nums"> · {formatCount(m.current)} / {formatCount(m.target)}</span>
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-raised"
          role="progressbar"
          aria-valuenow={Math.round(m.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${m.label}: ${Math.round(m.pct)}% complete`}
        >
          <div className="h-full rounded-full bg-gold" style={{ width: `${m.pct}%` }} />
        </div>
      </div>
    </>
  );

  const shell = "block h-full rounded-2xl border border-border bg-surface p-4";

  // Set milestones deep-link to the set page; badge milestones have nowhere
  // specific to go, so they stay inert rather than pretending to be clickable.
  return m.href ? (
    <Link href={m.href} className={`${shell} hover:border-gold/40 hover:bg-surface-raised transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/** Thresholds run to 50,000, so keep long numbers from wrapping the card. */
function formatCount(n: number): string {
  return n >= 1000 ? n.toLocaleString("en-US") : String(n);
}
