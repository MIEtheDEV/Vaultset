import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { awardBadges, BADGE_MAP, type BadgeSlug } from "@/lib/badges";
import type { MasterSetView } from "@/lib/sets/masterset";

// Lazily record set completions and award the associated one-time badges when a
// user views a set they've finished — the same lazy-on-load pattern the dashboard
// uses for its badges. `user_set_completions` records EVERY completed (set, tier)
// (for profile display + marketplace signals); the badge fires only for the first
// set of each tier.

const TIER_BADGE: Record<string, BadgeSlug> = {
  complete: "set_finisher",
  master: "master_setter",
};

export async function recordAndAwardCompletion(
  supabase: SupabaseClient,
  userId: string,
  view: MasterSetView,
): Promise<void> {
  const tiers: ("complete" | "master")[] = [];
  if (view.complete.total > 0 && view.complete.owned >= view.complete.total) tiers.push("complete");
  if (view.master.total > 0 && view.master.owned >= view.master.total) tiers.push("master");
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
