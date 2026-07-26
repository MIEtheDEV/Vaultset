import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { awardBadges, BADGE_MAP, type BadgeSlug } from "@/lib/badges";
import type { Progress } from "@/lib/sets/masterset";

// Lazily record set completions and award the associated one-time badges.
// `user_set_completions` records EVERY completed (set, tier) — for profile display
// and marketplace signals; the badge fires only for the first set of each tier.
//
// Originally this could only be reached by opening one specific set's page, which
// meant finishing a set and never navigating back to it left no record at all —
// the table sat empty in production. `recordCompletionsFromSummaries` closes that
// hole by checking every set the user has touched, from data the dashboard and the
// /masterset index already compute.

const TIER_BADGE: Record<string, BadgeSlug> = {
  complete: "set_finisher",
  master: "master_setter",
};

/**
 * The minimum shape needed to judge completion. Satisfied by both `MasterSetView`
 * (one set, full detail) and `SetSummary` (the per-set index rows), so one code
 * path serves the set page and the bulk sweep.
 */
export type CompletionCandidate = {
  setCode: string;
  setName: string;
  complete: Progress;
  master: Progress;
};

function completedTiers(view: CompletionCandidate): ("complete" | "master")[] {
  const tiers: ("complete" | "master")[] = [];
  if (view.complete.total > 0 && view.complete.owned >= view.complete.total) tiers.push("complete");
  if (view.master.total > 0 && view.master.owned >= view.master.total) tiers.push("master");
  return tiers;
}

export async function recordAndAwardCompletion(
  supabase: SupabaseClient,
  userId: string,
  view: CompletionCandidate,
): Promise<void> {
  const tiers = completedTiers(view);
  if (tiers.length === 0) return;

  // Record the completion(s). ignoreDuplicates keeps this idempotent across views.
  await supabase.from("user_set_completions").upsert(
    tiers.map((tier) => ({ user_id: userId, set_code: view.setCode, tier })),
    { onConflict: "user_id,set_code,tier", ignoreDuplicates: true },
  );

  // Award the one-time badge for each tier, but only if not already earned —
  // mirrors the dashboard so we don't fire a duplicate notification.
  const slugs = [...new Set(tiers.map((t) => TIER_BADGE[t]))];
  const { data: existing } = await supabase
    .from("user_badges")
    .select("badge_slug")
    .eq("user_id", userId)
    .in("badge_slug", slugs);
  const have = new Set((existing ?? []).map((r) => r.badge_slug as string));
  const newSlugs = slugs.filter((s) => !have.has(s));
  if (newSlugs.length === 0) return;

  const awarded = await awardBadges(supabase, userId, newSlugs);
  if (awarded.length === 0) return;

  // Fire a badge_earned notification per newly earned badge (admin client, like
  // the dashboard). The notifications_badge_earned_unique index is a safety net.
  const admin = createAdminClient();
  await admin.from("notifications").insert(
    awarded.map((slug) => ({
      user_id: userId,
      type: "badge_earned",
      actor_id: null,
      data: {
        badge_slug: slug,
        badge_label: BADGE_MAP.get(slug)?.label,
        badge_description: BADGE_MAP.get(slug)?.description,
        set_code: view.setCode,
        set_name: view.setName,
      },
    })),
  );
}

/**
 * Record every completed set the user has, from the per-set summaries the
 * dashboard and /masterset index already compute.
 *
 * This is the sweep that makes `user_set_completions` trustworthy: previously a
 * completion was only ever written if the user happened to open that set's own
 * page, so the table stayed empty in production even for finished sets.
 *
 * Returns the newly-recorded completions so the caller can celebrate them. Safe to
 * call on every load — the upsert ignores duplicates and the badge award checks
 * what's already held.
 */
export async function recordCompletionsFromSummaries(
  supabase: SupabaseClient,
  userId: string,
  summaries: CompletionCandidate[],
): Promise<{ setCode: string; setName: string; tier: "complete" | "master" }[]> {
  const rows = summaries.flatMap((s) =>
    completedTiers(s).map((tier) => ({ setCode: s.setCode, setName: s.setName, tier })),
  );
  if (rows.length === 0) return [];

  // Which of these are new? Read first so the return value reflects only genuinely
  // fresh completions — re-celebrating an old one on every page load would be worse
  // than never celebrating at all.
  const { data: existing } = await supabase
    .from("user_set_completions")
    .select("set_code, tier")
    .eq("user_id", userId)
    .in("set_code", [...new Set(rows.map((r) => r.setCode))]);

  const have = new Set((existing ?? []).map((r) => `${r.set_code}:${r.tier}`));
  const fresh = rows.filter((r) => !have.has(`${r.setCode}:${r.tier}`));

  await supabase.from("user_set_completions").upsert(
    rows.map((r) => ({ user_id: userId, set_code: r.setCode, tier: r.tier })),
    { onConflict: "user_id,set_code,tier", ignoreDuplicates: true },
  );

  // Badges are one-time across all sets, so award from the full set rather than
  // just the fresh ones — a user whose first completion predates this sweep should
  // still receive the badge.
  const slugs = [...new Set(rows.map((r) => TIER_BADGE[r.tier]))];
  const { data: heldBadges } = await supabase
    .from("user_badges")
    .select("badge_slug")
    .eq("user_id", userId)
    .in("badge_slug", slugs);

  const heldSlugs = new Set((heldBadges ?? []).map((r) => r.badge_slug as string));
  const newSlugs = slugs.filter((s) => !heldSlugs.has(s)) as BadgeSlug[];

  if (newSlugs.length > 0) {
    const awarded = await awardBadges(supabase, userId, newSlugs);
    if (awarded.length > 0) {
      const admin = createAdminClient();
      await admin.from("notifications").insert(
        awarded.map((slug) => ({
          user_id: userId,
          type: "badge_earned",
          actor_id: null,
          data: {
            badge_slug: slug,
            badge_label: BADGE_MAP.get(slug)?.label,
            badge_description: BADGE_MAP.get(slug)?.description,
          },
        })),
      );
    }
  }

  return fresh;
}
