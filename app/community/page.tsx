import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { timeAgo } from "@/lib/timeAgo";

export const metadata: Metadata = {
  title: "Community",
  description: "Discover trading card collectors on Vaultset. Browse active listings, graded cards, and connect with the community.",
  alternates: { canonical: "/community" },
};

export default async function CommunityPage() {
  const supabase = await createClient();

  const [
    { data: allProfiles },
    { data: publicItems },
    { data: followRows },
  ] = await Promise.all([
    supabase.from("profiles").select("id, username, created_at, city").order("username"),
    supabase.from("collection_items").select("user_id").or("for_sale.eq.true,for_trade.eq.true"),
    supabase.from("follows").select("following_id"),
  ]);

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
                    <p className="text-sm font-medium text-foreground">@{profile.username}</p>
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

              return (
                <Link
                  key={profile.id}
                  href={`/profile/${profile.username}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-surface-raised transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">@{profile.username}</p>
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
                  <div className="flex items-center gap-3">
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

      {/* Coming Soon */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-semibold text-foreground mb-4">Coming in Future Updates</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: "Collection Showcase", description: "Display your master sets and top pulls." },
            { title: "Achievement Badges",  description: "Earn badges for collection milestones." },
          ].map(({ title, description }) => (
            <div key={title} className="rounded-xl border border-border bg-surface-raised p-4 space-y-1">
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs text-foreground-muted leading-relaxed">{description}</p>
            </div>
          ))}
          <Link
            href="/reveals"
            className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-1 hover:border-violet-500/40 transition-colors"
          >
            <p className="text-sm font-medium text-foreground">Pull Reveals</p>
            <p className="text-xs text-foreground-muted leading-relaxed">Share your pack openings with the community.</p>
            <p className="text-xs text-violet-400 mt-1">View reveals →</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
