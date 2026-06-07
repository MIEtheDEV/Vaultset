"use client";

import { useState } from "react";
import { BADGES, BADGE_MAP, type BadgeMeta, type BadgeSlug } from "@/lib/badges";
import { BadgeChip } from "@/components/BadgeChip";
import { createClient } from "@/utils/supabase/client";

type EarnedBadge = { badge_slug: string; earned_at: string };

type Props = {
  earnedBadges: EarnedBadge[];
  isOwnProfile?: boolean;
  profileUserId: string;
  initialFeaturedSlugs: string[];
};

const MAX_FEATURED = 5;

function EmptySlot() {
  return (
    <svg
      width="32"
      height="36"
      viewBox="-2 -2 56 64"
      aria-hidden="true"
      className="opacity-10 text-foreground"
    >
      <polygon
        points="26,2 50,15 50,45 26,58 2,45 2,15"
        fill="transparent"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="5 3"
      />
    </svg>
  );
}

export function BadgeBoard({
  earnedBadges,
  isOwnProfile = false,
  profileUserId,
  initialFeaturedSlugs,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const earnedMap = new Map(earnedBadges.map((b) => [b.badge_slug, b.earned_at]));
  const earnedCount = earnedBadges.length;
  const total = BADGES.length;

  // Fall back to 5 most recently earned when no custom selection is saved
  const autoFeatured = earnedBadges
    .slice()
    .sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime())
    .slice(0, MAX_FEATURED)
    .map((b) => b.badge_slug);

  const [featuredSlugs, setFeaturedSlugs] = useState<string[]>(
    initialFeaturedSlugs.length > 0 ? initialFeaturedSlugs.slice(0, MAX_FEATURED) : autoFeatured
  );

  const toggleFeatured = async (slug: string) => {
    if (!isOwnProfile || !earnedMap.has(slug)) return;

    let next: string[];
    if (featuredSlugs.includes(slug)) {
      next = featuredSlugs.filter((s) => s !== slug);
    } else {
      if (featuredSlugs.length >= MAX_FEATURED) return;
      next = [...featuredSlugs, slug];
    }

    setFeaturedSlugs(next);
    const supabase = createClient();
    await supabase.from("profiles").update({ featured_badge_slugs: next }).eq("id", profileUserId);
  };

  const featuredDisplay = featuredSlugs
    .map((slug) => BADGE_MAP.get(slug as BadgeSlug))
    .filter((b): b is BadgeMeta => !!b);

  const remainingCount = total - earnedCount;
  const isFull = featuredSlugs.length >= MAX_FEATURED;

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* ── Trigger ──────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-raised transition-colors text-left"
        aria-expanded={isOpen}
      >
        {/* Mini featured hexes */}
        <div className="flex items-center gap-1.5">
          {featuredDisplay.map((badge) => (
            <BadgeChip key={badge.slug} badge={badge} earned size="mini" />
          ))}
          {/* Empty placeholder slots when fewer than 5 badges are featured */}
          {Array.from({ length: MAX_FEATURED - featuredDisplay.length }).map((_, i) => (
            <EmptySlot key={i} />
          ))}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Achievements</p>
          <p className="text-xs text-foreground-muted">{earnedCount} of {total} earned</p>
        </div>

        {/* Progress bar + chevron */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-20 h-1 rounded-full bg-surface-raised overflow-hidden">
              <div
                className="h-full rounded-full bg-gold transition-all"
                style={{ width: `${(earnedCount / total) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gold tabular-nums">
              {Math.round((earnedCount / total) * 100)}%
            </span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-foreground-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* ── Expanded ─────────────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="border-t border-border px-5 pt-5 pb-6">
          {isOwnProfile && (
            <p className="text-xs text-foreground-muted mb-4 text-center">
              {isFull
                ? "Tap a starred badge to remove it from your featured row"
                : `Tap an earned badge to feature it above · ${MAX_FEATURED - featuredSlugs.length} slot${MAX_FEATURED - featuredSlugs.length !== 1 ? "s" : ""} open`}
            </p>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-5">
            {BADGES.map((badge) => {
              const earned = earnedMap.has(badge.slug);
              const isFeatured = featuredSlugs.includes(badge.slug);

              return (
                <div key={badge.slug} className="relative">
                  <BadgeChip
                    badge={badge}
                    earned={earned}
                    earnedAt={earnedMap.get(badge.slug)}
                  />
                  {/* Pin toggle: own profile + earned */}
                  {isOwnProfile && earned && (
                    <button
                      onClick={() => toggleFeatured(badge.slug)}
                      title={isFeatured ? "Remove from featured" : isFull ? "Remove another badge first" : "Feature this badge"}
                      disabled={!isFeatured && isFull}
                      className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                        isFeatured
                          ? "border-gold bg-gold text-background"
                          : isFull
                          ? "border-border bg-surface text-foreground-muted opacity-30 cursor-not-allowed"
                          : "border-border bg-surface text-foreground-muted hover:border-gold/60 hover:text-gold"
                      }`}
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill={isFeatured ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {remainingCount > 0 && (
            <p className="mt-5 text-xs text-foreground-muted text-center">
              {isOwnProfile
                ? `${remainingCount} badge${remainingCount !== 1 ? "s" : ""} left to unlock`
                : `${remainingCount} badge${remainingCount !== 1 ? "s" : ""} not yet earned`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
