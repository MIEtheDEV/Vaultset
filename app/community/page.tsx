import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { timeAgo } from "@/lib/timeAgo";
import { BadgeChip } from "@/components/BadgeChip";
import { BADGE_MAP, type BadgeSlug } from "@/lib/badges";

export const metadata: Metadata = {
  title: "Community",
  description: "Discover trading card collectors on Vaultset. Browse active listings, graded cards, and connect with the community.",
  alternates: { canonical: "/community" },
};

export default async function CommunityPage() {
  const supabase = await createClient();

  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("id, username, created_at, city")
    .eq("banned", false)
    .order("username");

  const profileIds = (allProfiles ?? []).map((p) => p.id);

  const [
    { data: publicItems },
    { data: followRows },
    { data: featuredRows },
    { data: earnedRows },
    { data: pricingItems },
  ] = await Promise.all([
    supabase.from("collection_items").select("user_id").or("for_sale.eq.true,for_trade.eq.true"),
    supabase.from("follows").select("following_id"),
    // Resilient: returns null data (not a crash) if column doesn't exist yet
    profileIds.length
      ? supabase.from("profiles").select("id, featured_badge_slugs").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    profileIds.length
      ? supabase.from("user_badges").select("user_id, badge_slug, earned_at").in("user_id", profileIds)
      : Promise.resolve({ data: [] as { user_id: string; badge_slug: string; earned_at: string }[] }),
    supabase
      .from("collection_items")
      .select("list_price, cards(name, set_name)")
      .eq("for_sale", true)
      .not("list_price", "is", null)
      .gt("list_price", 0),
  ]);

  // userId → explicitly featured slug list (may be empty if column doesn't exist yet)
  const featuredMap = new Map<string, string[]>(
    (featuredRows ?? []).map((r) => [r.id, (r as any).featured_badge_slugs as string[] ?? []])
  );

  // userId → earned slugs sorted newest-first (for fallback display)
  const earnedByUser = new Map<string, string[]>();
  [...(earnedRows ?? [])]
    .sort((a, b) => new Date((b as any).earned_at).getTime() - new Date((a as any).earned_at).getTime())
    .forEach((r) => {
      if (!earnedByUser.has(r.user_id)) earnedByUser.set(r.user_id, []);
      earnedByUser.get(r.user_id)!.push(r.badge_slug);
    });

  // Returns badges to display: explicit selection if set, otherwise 5 most recently earned
  function getFeaturedBadges(userId: string) {
    const featured = featuredMap.get(userId) ?? [];
    const earned   = new Set(earnedByUser.get(userId) ?? []);
    const slugs    = featured.filter((s) => earned.has(s)).length > 0
      ? featured.filter((s) => earned.has(s))
      : (earnedByUser.get(userId) ?? []).slice(0, 5);
    return slugs
      .map((s) => BADGE_MAP.get(s as BadgeSlug))
      .filter(Boolean) as NonNullable<ReturnType<typeof BADGE_MAP.get>>[];
  }

  const listingCountMap = new Map<string, number>();
  publicItems?.forEach((l) => {
    listingCountMap.set(l.user_id, (listingCountMap.get(l.user_id) ?? 0) + 1);
  });

  const followerCountMap = new Map<string, number>();
  followRows?.forEach((f) => {
    followerCountMap.set(f.following_id, (followerCountMap.get(f.following_id) ?? 0) + 1);
  });

  const totalCollectors = allProfiles?.length ?? 0;
  const totalListings   = publicItems?.length ?? 0;
  const totalFollows    = followRows?.length ?? 0;

  const topCollectors = [...(allProfiles ?? [])]
    .filter((p) => (followerCountMap.get(p.id) ?? 0) > 0)
    .sort((a, b) => (followerCountMap.get(b.id) ?? 0) - (followerCountMap.get(a.id) ?? 0))
    .slice(0, 10);

  // ── Pricing stats ──────────────────────────────────────────────────────────

  const setStatsMap = new Map<string, { count: number; prices: number[] }>();
  const cardStatsMap = new Map<string, { name: string; setName: string; count: number; prices: number[] }>();

  (pricingItems ?? []).forEach((item) => {
    const raw  = (item as any).cards;
    const card = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    const price = item.list_price as number;
    if (!card?.set_name) return;

    // Per set
    if (!setStatsMap.has(card.set_name)) setStatsMap.set(card.set_name, { count: 0, prices: [] });
    const setEntry = setStatsMap.get(card.set_name)!;
    setEntry.count++;
    setEntry.prices.push(price);

    // Per card (name + set as key)
    if (!card?.name) return;
    const key = `${card.name}||${card.set_name}`;
    if (!cardStatsMap.has(key)) cardStatsMap.set(key, { name: card.name, setName: card.set_name, count: 0, prices: [] });
    const cardEntry = cardStatsMap.get(key)!;
    cardEntry.count++;
    cardEntry.prices.push(price);
  });

  const topSets = [...setStatsMap.entries()]
    .map(([name, { count, prices }]) => ({
      name,
      count,
      avgPrice: prices.reduce((s, p) => s + p, 0) / prices.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topCards = [...cardStatsMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((c) => ({
      ...c,
      minPrice: Math.min(...c.prices),
      maxPrice: Math.max(...c.prices),
    }));

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Community</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Discover collectors and browse what&apos;s available across the community.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Collectors",      value: totalCollectors },
          { label: "Active Listings", value: totalListings   },
          { label: "Follows",         value: totalFollows    },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-5 text-center">
            <p className="text-3xl font-bold text-gold">{value}</p>
            <p className="mt-1 text-xs text-foreground-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Top Collectors Leaderboard */}
      {topCollectors.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-foreground">Top Collectors</h2>
          <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
            {topCollectors.map((profile, index) => {
              const followers = followerCountMap.get(profile.id) ?? 0;
              const listings  = listingCountMap.get(profile.id) ?? 0;
              const badges    = getFeaturedBadges(profile.id);
              return (
                <Link
                  key={profile.id}
                  href={`/profile/${profile.username}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface-raised transition-colors"
                >
                  <span className={`w-6 text-center text-sm font-bold shrink-0 ${index === 0 ? "text-gold" : index === 1 ? "text-foreground-muted" : index === 2 ? "text-amber-600" : "text-foreground-muted"}`}>
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">@{profile.username}</span>
                      {badges.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          {badges.map((badge) => (
                            <BadgeChip key={badge.slug} badge={badge} earned size="mini" />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {followers} follower{followers !== 1 ? "s" : ""}
                      {listings > 0 ? ` · ${listings} listing${listings !== 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Market Snapshot */}
      {(topSets.length > 0 || topCards.length > 0) && (
        <div className="space-y-5">
          <h2 className="font-semibold text-foreground">Market Snapshot</h2>

          {topSets.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Most Active Sets</h3>
              <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
                {topSets.map((set, i) => (
                  <div key={set.name} className="flex items-center gap-4 px-5 py-3">
                    <span className={`w-5 text-center text-sm font-bold shrink-0 ${i === 0 ? "text-gold" : "text-foreground-muted"}`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-foreground truncate">{set.name}</span>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <span className="text-foreground-muted">{set.count} listing{set.count !== 1 ? "s" : ""}</span>
                      <span className="text-gold font-medium w-16 text-right">avg ${set.avgPrice.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topCards.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Most Listed Cards</h3>
              <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
                {topCards.map((card) => (
                  <div key={`${card.name}||${card.setName}`} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{card.name}</p>
                      <p className="text-xs text-foreground-muted truncate">{card.setName}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <span className="text-foreground-muted">{card.count} listing{card.count !== 1 ? "s" : ""}</span>
                      <span className="text-gold font-medium w-20 text-right">
                        {card.minPrice === card.maxPrice
                          ? `$${card.minPrice.toFixed(2)}`
                          : `$${card.minPrice.toFixed(2)}–$${card.maxPrice.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Collectors */}
      <div className="space-y-4">
        <h2 className="font-semibold text-foreground">
          Collectors
          <span className="ml-2 text-sm font-normal text-foreground-muted">({totalCollectors})</span>
        </h2>

        {(!allProfiles || allProfiles.length === 0) ? (
          <div className="rounded-2xl border border-border bg-surface py-12 text-center">
            <p className="text-sm text-foreground-muted">No collectors yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
            {allProfiles.map((profile) => {
              const listingCount  = listingCountMap.get(profile.id) ?? 0;
              const followerCount = followerCountMap.get(profile.id) ?? 0;
              const badges        = getFeaturedBadges(profile.id);

              return (
                <Link
                  key={profile.id}
                  href={`/profile/${profile.username}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-surface-raised transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">@{profile.username}</span>
                      {badges.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          {badges.map((badge) => (
                            <BadgeChip key={badge.slug} badge={badge} earned size="mini" />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-foreground-muted flex items-center gap-2 flex-wrap">
                      <span>Joined {timeAgo(profile.created_at)}</span>
                      {(profile as any).city && (
                        <span className="flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          {(profile as any).city}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {followerCount > 0 && (
                      <span className="text-xs text-foreground-muted">
                        {followerCount} follower{followerCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {listingCount > 0 ? (
                      <span className="text-xs font-medium text-gold">
                        {listingCount} listing{listingCount !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-foreground-muted">No listings</span>
                    )}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* More features */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-semibold text-foreground mb-4">More on Vaultset</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Link
            href="/reveals"
            className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-1 hover:border-violet-500/40 transition-colors"
          >
            <p className="text-sm font-medium text-foreground">Pull Reveals</p>
            <p className="text-xs text-foreground-muted leading-relaxed">Share your pack openings and see what the community is pulling.</p>
            <p className="text-xs text-violet-400 mt-1">View reveals →</p>
          </Link>
          <Link
            href="/collections/new"
            className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-1 hover:border-blue-500/40 transition-colors"
          >
            <p className="text-sm font-medium text-foreground">Collections</p>
            <p className="text-xs text-foreground-muted leading-relaxed">Track set completion and rarity hunts. Collections are visible on your profile.</p>
            <p className="text-xs text-blue-400 mt-1">Create a collection →</p>
          </Link>
        </div>
      </div>

    </div>
  );
}
