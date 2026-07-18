import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { FollowButton } from "@/components/FollowButton";
import { timeAgo } from "@/lib/timeAgo";
import { AVATAR_COLORS, resolveAvatarColor, isHexColor } from "@/lib/avatarColors";
import { likeEscape } from "@/lib/username";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username}'s Followers`,
    robots: { index: false },
    alternates: { canonical: `/profile/${username}/followers` },
  };
}

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", likeEscape(username))
    .single();

  if (!profile) redirect("/community");

  const { data: follows } = await supabase
    .from("follows")
    .select("follower_id, created_at")
    .eq("following_id", profile.id)
    .order("created_at", { ascending: false });

  const followerIds = follows?.map((f) => f.follower_id) ?? [];

  const [
    { data: followerProfiles },
    { data: myFollows },
  ] = await Promise.all([
    followerIds.length
      ? supabase
          .from("profiles")
          .select("id, username, created_at, avatar_url, avatar_color")
          .in("id", followerIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    user
      ? supabase.from("follows").select("following_id").eq("follower_id", user.id)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const profileMap = new Map((followerProfiles ?? []).map((p: any) => [p.id, p]));
  const orderedProfiles = followerIds.map((id) => profileMap.get(id)).filter(Boolean);
  const myFollowingSet = new Set((myFollows ?? []).map((f: any) => f.following_id));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Community", item: "https://www.vaultset.app/community" },
      { "@type": "ListItem", position: 2, name: `@${username}`, item: `https://www.vaultset.app/profile/${username}` },
      { "@type": "ListItem", position: 3, name: "Followers", item: `https://www.vaultset.app/profile/${username}/followers` },
    ],
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <Link
        href={`/profile/${username}`}
        className="text-sm text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1.5 w-fit"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        @{username}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Followers</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {followerIds.length} {followerIds.length === 1 ? "person" : "people"} following @{username}
        </p>
      </div>

      {orderedProfiles.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center">
          <p className="text-sm text-foreground-muted">No followers yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
          {orderedProfiles.map((fp: any) => {
            const customHex = fp.avatar_color && isHexColor(fp.avatar_color) ? fp.avatar_color : null;
            const avatar = customHex ? null : AVATAR_COLORS[resolveAvatarColor(fp.avatar_color, fp.username)];
            const initial = fp.username.charAt(0).toUpperCase();
            const isOwn = user?.id === fp.id;

            return (
              <div key={fp.id} className="flex items-center justify-between px-5 py-3 hover:bg-surface-raised transition-colors">
                <Link href={`/profile/${fp.username}`} className="flex items-center gap-3 min-w-0">
                  {fp.avatar_url ? (
                    <img src={fp.avatar_url} alt={fp.username} className="h-9 w-9 shrink-0 rounded-full object-cover border border-border" />
                  ) : customHex ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold select-none" style={{ background: customHex + "22", borderColor: customHex + "66", color: customHex }}>
                      {initial}
                    </div>
                  ) : (
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold select-none ${avatar!.bg} ${avatar!.border} ${avatar!.text}`}>
                      {initial}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">@{fp.username}</p>
                    <p className="text-xs text-foreground-muted">Joined {timeAgo(fp.created_at)}</p>
                  </div>
                </Link>
                {!isOwn && user && (
                  <FollowButton
                    profileId={fp.id}
                    initialIsFollowing={myFollowingSet.has(fp.id)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
