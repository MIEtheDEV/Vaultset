import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { CardStudio } from "@/components/CardStudio";
import type { ProfileCardData } from "@/components/ProfileCardVisual";
import type { CardTheme } from "@/components/ProfileCardVisual";
import { timeAgo } from "@/lib/timeAgo";
import { likeEscape } from "@/lib/username";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username}'s Collector Card — Vaultset`,
    robots: { index: false },
  };
}

const VALID_THEMES = new Set(["vault", "holo", "print"]);

export default async function ProfileCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ cta?: string; theme?: string }>;
}) {
  const [{ username }, sp] = await Promise.all([params, searchParams]);

  const initialCta   = sp.cta   ?? "Check out my collection";
  const rawTheme     = sp.theme ?? "vault";
  const initialTheme = (VALID_THEMES.has(rawTheme) ? rawTheme : "vault") as CardTheme;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, created_at, is_supporter, bio, specialty, featured_item_id, avatar_url, avatar_color")
    .ilike("username", likeEscape(username))
    .single();

  if (!profile) redirect("/community");

  const featuredItemId = (profile as any).featured_item_id as string | null;

  const [
    { data: allItems },
    { count: serialCount },
    { data: thumbListings },
    featuredResult,
  ] = await Promise.all([
    supabase
      .from("collection_items")
      .select("quantity, grader, for_sale, for_trade")
      .eq("user_id", profile.id),

    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .lte("created_at", profile.created_at),

    supabase
      .from("collection_items")
      .select("cards(image_url)")
      .eq("user_id", profile.id)
      .eq("for_sale", true)
      .order("created_at", { ascending: false })
      .limit(3),

    featuredItemId
      ? supabase
          .from("collection_items")
          .select("cards(image_url)")
          .eq("id", featuredItemId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Counts reflect physical copies (sum of quantity), consistent with the rest of the site.
  const totalCards     = allItems?.reduce((s, r) => s + (r.quantity ?? 1), 0) ?? 0;
  const gradedCount    = allItems?.filter((r) => !!(r as any).grader).reduce((s, r) => s + (r.quantity ?? 1), 0) ?? 0;
  const activeListings = allItems?.filter((r) => (r as any).for_sale || (r as any).for_trade).reduce((s, r) => s + (r.quantity ?? 1), 0) ?? 0;

  const listingThumbs: string[] = [];
  (thumbListings ?? []).forEach((l) => {
    const raw  = (l as any).cards;
    const card = Array.isArray(raw) ? raw[0] : raw;
    if (card?.image_url) listingThumbs.push(card.image_url as string);
  });

  const featuredRaw = (featuredResult as any)?.data ?? null;
  let featuredImageUrl: string | null = null;
  if (featuredRaw) {
    const raw  = (featuredRaw as any).cards;
    const card = Array.isArray(raw) ? raw[0] : raw;
    featuredImageUrl = (card?.image_url as string) ?? null;
  }

  const data: ProfileCardData = {
    username:        profile.username,
    isSupporter:     profile.is_supporter ?? false,
    specialty:       (profile as any).specialty       ?? null,
    bio:             (profile as any).bio             ?? null,
    totalCards,
    activeListings:  activeListings ?? 0,
    gradedCount,
    joinedAgo:       timeAgo(profile.created_at),
    serialNumber:    serialCount ?? 1,
    featuredImageUrl,
    avatarUrl:       (profile as any).avatar_url   as string | null ?? null,
    avatarColorKey:  (profile as any).avatar_color as string | null ?? null,
    listingThumbs,
    profileUrl:      `https://vaultset.app/profile/${profile.username}`,
  };

  return (
    <div className="space-y-8">
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
        <h1 className="text-2xl font-bold text-foreground">Collector Card</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Download or share your digital collector identity.
        </p>
      </div>

      <CardStudio data={data} initialCta={initialCta} initialTheme={initialTheme} />
    </div>
  );
}
