import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { AchievementStudio } from "@/components/AchievementStudio";
import type { AchievementCardData } from "@/components/AchievementCardVisual";
import { BADGE_MAP, BADGES, type BadgeSlug } from "@/lib/badges";
import { type CardTheme } from "@/lib/shareCardThemes";
import { likeEscape } from "@/lib/username";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}): Promise<Metadata> {
  const { username, slug } = await params;
  const label = BADGE_MAP.get(slug as BadgeSlug)?.label ?? "Achievement";
  return {
    title: `@${username} — ${label}`,
    robots: { index: false },
  };
}

const VALID_THEMES = new Set<CardTheme>(["vault", "holo", "print"]);

/**
 * Shareable card for a single earned achievement.
 *
 * The badge system has been awarding milestones since Phase 2 with no way to show
 * anyone. This is the outward-facing half — and the only piece of Phase 6 that can
 * bring new people in rather than just retaining the ones already here.
 *
 * Only the badge's owner can open the studio: the card carries a QR to their
 * profile and a download button, so it is an authoring surface, not a public page.
 */
export default async function AchievementCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; slug: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const [{ username, slug }, sp] = await Promise.all([params, searchParams]);

  const badge = BADGE_MAP.get(slug as BadgeSlug);
  if (!badge) redirect(`/profile/${username}`);

  const rawTheme = (sp.theme ?? "vault") as CardTheme;
  const initialTheme = VALID_THEMES.has(rawTheme) ? rawTheme : "vault";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", likeEscape(username))
    .single();

  if (!profile) redirect("/community");

  // Authoring your own card only — otherwise anyone could mint a share image for
  // someone else's achievement.
  if (profile.id !== user.id) redirect(`/profile/${profile.username}`);

  const { data: earned } = await supabase
    .from("user_badges")
    .select("badge_slug, earned_at")
    .eq("user_id", profile.id)
    .order("earned_at", { ascending: true });

  const rows = (earned ?? []) as { badge_slug: string; earned_at: string }[];
  const mine = rows.find((r) => r.badge_slug === slug);

  // Can't share what you haven't earned.
  if (!mine) redirect(`/profile/${profile.username}`);

  const data: AchievementCardData = {
    username: profile.username,
    badge,
    earnedOn: mine.earned_at
      ? new Date(mine.earned_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null,
    // Ordinal by earn order, so the card reads "achievement 7 / 50".
    index: rows.findIndex((r) => r.badge_slug === slug) + 1,
    totalBadges: BADGES.length,
    profileUrl: `https://www.vaultset.app/profile/${profile.username}`,
  };

  return (
    <div className="space-y-8">
      <Link
        href={`/profile/${profile.username}`}
        className="flex w-fit items-center gap-1.5 text-sm text-foreground-muted transition-colors hover:text-foreground"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        @{profile.username}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{badge.label}</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Share the achievement — download it as an image or send the link.
        </p>
      </div>

      <AchievementStudio data={data} initialTheme={initialTheme} />
    </div>
  );
}
