// "How close am I to the next one?" — the question the badge system could never
// answer.
//
// Fifty badges have been defined and awarded since Phase 2, but nothing ever told
// a user what they were working toward: a badge simply appeared, already earned.
// Thresholds only became askable once they moved out of an if-chain and into
// `BADGE_THRESHOLDS` (lib/badges.ts).
//
// Two kinds of milestone feed the same widget:
//   - Badge milestones, from the count-derivable thresholds.
//   - Set milestones, from per-set completion — the strongest "collect them all"
//     pull in the product, and already computed for the /masterset index.

import {
  BADGE_THRESHOLDS,
  BADGE_MAP,
  type BadgeSlug,
  type BadgeStats,
  type BadgeMeta,
} from "@/lib/badges";
import type { SetSummary } from "@/lib/sets/masterset";

export type Milestone = {
  /** `badge:<slug>` or `set:<code>:<complete|master>` — stable, for React keys. */
  key: string;
  kind: "badge" | "set";
  label: string;
  description: string;
  color: BadgeMeta["color"];
  current: number;
  target: number;
  /** How many more are needed. Always ≥ 1 for an unearned milestone. */
  remaining: number;
  /** Progress toward the target, 0–100, clamped. */
  pct: number;
  /** Badge milestones carry their slug so the hex badge art can be reused. */
  slug?: BadgeSlug;
  /** Set milestones link to the set page. */
  href?: string;
};

function pctOf(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

/**
 * Unearned badge milestones, nearest-to-complete first.
 *
 * Ranked by fraction complete rather than raw distance, which keeps things the
 * user actually controls near the top: 73/100 cards outranks 0/1 followers, and
 * rightly so — nobody can go and acquire a follower on demand.
 */
export function badgeMilestones(
  stats: BadgeStats,
  earned: Iterable<BadgeSlug>,
): Milestone[] {
  const have = new Set(earned);

  return BADGE_THRESHOLDS
    .filter((t) => !have.has(t.slug))
    // Defensive: a stat at or past its threshold but not in `earned` means the
    // award pass hasn't run yet. Showing it as an outstanding milestone would read
    // as broken, so treat it as already done.
    .filter((t) => stats[t.stat] < t.threshold)
    .map((t) => {
      const meta = BADGE_MAP.get(t.slug);
      const current = stats[t.stat];
      return {
        key: `badge:${t.slug}`,
        kind: "badge" as const,
        slug: t.slug,
        label: meta?.label ?? t.slug,
        description: meta?.description ?? "",
        color: meta?.color ?? "blue",
        current,
        target: t.threshold,
        remaining: Math.max(1, Math.ceil(t.threshold - current)),
        pct: pctOf(current, t.threshold),
      };
    })
    .sort(byProximity);
}

/**
 * Set-completion milestones for sets the user has actually started.
 *
 * Untouched sets are excluded — with 150+ Pokémon sets, "0 of 198 cards" for a set
 * the user has never opened is noise, not a goal. Complete Set is offered before
 * Master Set for the same set, since finishing one card of each number is the
 * nearer objective.
 */
export function setMilestones(summaries: SetSummary[]): Milestone[] {
  const out: Milestone[] = [];

  for (const s of summaries) {
    if (s.complete.total === 0) continue;
    if (s.complete.owned === 0) continue; // never started

    if (s.complete.owned < s.complete.total) {
      out.push({
        key: `set:${s.setCode}:complete`,
        kind: "set",
        label: `${s.setName} — Complete Set`,
        description: `One of every card number in ${s.setName}`,
        color: "emerald",
        current: s.complete.owned,
        target: s.complete.total,
        remaining: s.complete.total - s.complete.owned,
        pct: pctOf(s.complete.owned, s.complete.total),
        href: `/masterset/${s.setCode}`,
      });
    } else if (s.master.total > 0 && s.master.owned < s.master.total) {
      // Complete Set already done — the remaining goal is every finish.
      out.push({
        key: `set:${s.setCode}:master`,
        kind: "set",
        label: `${s.setName} — Master Set`,
        description: `Every finish of every card in ${s.setName}`,
        color: "gold",
        current: s.master.owned,
        target: s.master.total,
        remaining: s.master.total - s.master.owned,
        pct: pctOf(s.master.owned, s.master.total),
        href: `/masterset/${s.setCode}`,
      });
    }
  }

  return out.sort(byProximity);
}

/**
 * Nearest milestone first; ties broken by fewest remaining, then by key so the
 * order is stable across renders rather than depending on input order.
 */
function byProximity(a: Milestone, b: Milestone): number {
  if (b.pct !== a.pct) return b.pct - a.pct;
  if (a.remaining !== b.remaining) return a.remaining - b.remaining;
  return a.key.localeCompare(b.key);
}

/**
 * The combined list for the dashboard widget.
 *
 * Badges and sets are interleaved by proximity, but at least one set milestone is
 * kept when any exists: set completion is the strongest retention hook in the
 * product, and a user 3 cards from finishing Base Set should never have that
 * buried under four generic count badges.
 */
export function nextMilestones(
  stats: BadgeStats,
  earned: Iterable<BadgeSlug>,
  summaries: SetSummary[] = [],
  limit = 3,
): Milestone[] {
  const badges = badgeMilestones(stats, earned);
  const sets = setMilestones(summaries);

  const combined = [...badges, ...sets].sort(byProximity);
  const picked = combined.slice(0, limit);

  if (sets.length > 0 && !picked.some((m) => m.kind === "set") && limit > 0) {
    picked[picked.length - 1] = sets[0];
  }

  return picked;
}
