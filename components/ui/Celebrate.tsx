"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { toast } from "sonner";

export type CelebrationEvent = {
  /** Stable, globally-unique id for the thing being celebrated (e.g. `badge:century`). */
  key: string;
  title: string;
  description?: string;
};

/**
 * Fires a one-time confetti burst + toast for freshly-earned milestones.
 *
 * The app already awards badges and records set completions — it just never told
 * anyone. Earning a badge previously meant a new line quietly appearing in an
 * activity list. This is the "it landed" moment.
 *
 * Deduped in `localStorage` by `key`, because the award path re-reports earned
 * milestones on every page load: without this, finishing a set would re-throw
 * confetti every time the dashboard was opened.
 */
const GOLD = ["#e8b84b", "#f5d07a", "#fff3c4", "#eef0ff"];
const SEEN_PREFIX = "vaultset:celebrated:";

function alreadyCelebrated(key: string): boolean {
  try {
    return localStorage.getItem(SEEN_PREFIX + key) !== null;
  } catch {
    // Storage blocked (private mode, embedded webview). We can't dedupe, so
    // prefer celebrating over silently swallowing a real milestone.
    return false;
  }
}

function markCelebrated(key: string) {
  try {
    localStorage.setItem(SEEN_PREFIX + key, "1");
  } catch {
    /* non-fatal — see above */
  }
}

/**
 * One centre pop plus two angled follow-ups; reads as a burst rather than a puff.
 * `disableForReducedMotion` is canvas-confetti's own guard, so reduced-motion
 * users still get the toast with no animation.
 */
function burst(register: (t: ReturnType<typeof setTimeout>) => void) {
  const base = { colors: GOLD, zIndex: 9999, disableForReducedMotion: true } as const;
  confetti({ ...base, particleCount: 70, spread: 70, startVelocity: 45, origin: { x: 0.5, y: 0.7 } });
  register(setTimeout(() => confetti({ ...base, particleCount: 40, angle: 60, spread: 60, origin: { x: 0, y: 0.85 } }), 120));
  register(setTimeout(() => confetti({ ...base, particleCount: 40, angle: 120, spread: 60, origin: { x: 1, y: 0.85 } }), 220));
}

export function Celebrate({ events }: { events: CelebrationEvent[] }) {
  useEffect(() => {
    // Safe to depend on `events` even though callers hand us a new array each
    // render: `markCelebrated` runs synchronously before anything is shown, so
    // every re-run after the first filters to empty and bails. The effect is
    // idempotent by construction rather than by dependency bookkeeping.
    const fresh = events.filter((e) => e.key && !alreadyCelebrated(e.key));
    if (fresh.length === 0) return;

    fresh.forEach((e) => markCelebrated(e.key));

    const timers: ReturnType<typeof setTimeout>[] = [];
    const register = (t: ReturnType<typeof setTimeout>) => timers.push(t);

    burst(register);
    // Stagger multiple milestones so they don't land as one illegible stack.
    fresh.forEach((e, i) => {
      register(
        setTimeout(() => toast.success(e.title, { description: e.description, duration: 6000 }), i * 450),
      );
    });

    return () => timers.forEach(clearTimeout);
  }, [events]);

  return null;
}
