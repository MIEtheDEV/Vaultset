import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import { SealedProductsGrid } from "@/components/SealedProductsGrid";
import { SupporterBadge } from "@/components/SupporterBadge";
import { ProBadge, ProTitle } from "@/components/ProBadge";
import { isProSubscriber } from "@/lib/proStatus";
import { BadgeBoard } from "@/components/BadgeBoard";
import type { BadgeSlug } from "@/lib/badges";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { ProfileTabs } from "@/components/ProfileTabs";
import { ReportButton } from "@/components/ReportButton";

import { AVATAR_COLORS, resolveAvatarColor, isHexColor } from "@/lib/avatarColors";
import { MessageButton } from "@/components/MessageButton";
import { FollowButton } from "@/components/FollowButton";
import { timeAgo } from "@/lib/timeAgo";
import { parseBio } from "@/lib/parseBio";

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { count: cardCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, bio, specialty, city")
      .eq("username", username)
      .single(),
    supabase
      .from("collection_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id",
        (await supabase.from("profiles").select("id").eq("username", username).single()).data?.id ?? ""
      ),
  ]);

  const parts: string[] = [];
  if (cardCount && cardCount > 0) parts.push(`${cardCount}-card collection`);
  if ((profile as any)?.specialty) parts.push((profile as any).specialty);
  if ((profile as any)?.city) parts.push((profile as any).city);

  const description = parts.length > 0
    ? `Browse @${username}'s ${parts.join(" · ")} on Vaultset. Active listings, wishlist, and collector profile.`
    : `Browse @${username}'s trading card collection, active listings, and wishlist on Vaultset.`;

  const keywords = [username, "trading card collector", "Pokemon cards"];
  if ((profile as any)?.specialty) keywords.push((profile as any).specialty);
  if ((profile as any)?.city) keywords.push((profile as any).city);

  return {
    title: `@${username}'s Profile`,
    description,
    keywords,
    alternates: { canonical: `/profile/${username}` },
    openGraph: {
      title: `@${username} — Vaultset`,
      description,
      images: [{ url: `/profile/${username}/card/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `@${username} — Vaultset`,
      description,
      images: [`/profile/${username}/card/opengraph-image`],
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Profiles are public — unauthenticated visitors see the full page with reduced interactivity

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, created_at, is_supporter, is_pro, pro_plan, pro_expires_at, bio, specialty, city, featured_item_id, avatar_url, avatar_color, showcase_border")
    .eq("username", username)
    .eq("banned", false)
    .single();

  if (!profile) redirect("/community");

  const isOwnProfile   = user?.id === profile.id;
  const isAdmin        = profile.username === process.env.ADMIN_USERNAME;
  const bio            = (profile as any).bio              as string | null;
  const specialty      = (profile as any).specialty        as string | null;
  const city           = (profile as any).city             as string | null;
  const featuredItemId = (profile as any).featured_item_id as string | null;
  const avatarUrl      = (profile as any).avatar_url        as string | null;
  const storedColor    = (profile as any).avatar_color      as string | null;

  const [
    { data: allItems },
    { data: cardListings },
    { data: sealedListings },
    { data: watchlistData },
    { data: spotlightItems },
    featuredResult,
    { data: wishlistItems },
    { count: followerCount },
    { count: followingCount },
    { data: followState },
    { data: followsYouBackState },
    { data: myFollowingData },
    { data: myWishlistData },
    { data: profileBadgeData },
    { data: showcaseData },
  ] = await Promise.all([
    // All collection items — used for stats and vault tab display
    supabase
      .from("collection_items")
      .select("id, quantity, condition, finish, grader, grade, for_sale, for_trade, cards(name, set_name, image_url)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),

    // Card listings (for_sale or for_trade)
    supabase
      .from("collection_items")
      .select(`
        id, user_id, condition, finish, for_sale, for_trade,
        list_price, grader, grade, quantity, created_at,
        cards ( id, game, name, set_name, card_number, year, image_url, game_data )
      `)
      .eq("user_id", profile.id)
      .or("for_sale.eq.true,for_trade.eq.true")
      .order("created_at", { ascending: false }),

    // Sealed product listings
    supabase
      .from("product_purchases")
      .select("id, user_id, name, product_type, cost, for_sale, for_trade, list_price, purchased_at, notes")
      .eq("user_id", profile.id)
      .or("for_sale.eq.true,for_trade.eq.true")
      .order("purchased_at", { ascending: false }),

    // Current user's watchlist (for heart states) — skipped for unauthenticated visitors
    user
      ? supabase.from("watchlist").select("item_id").eq("user_id", user.id)
      : Promise.resolve({ data: null, error: null }),

    // Graded items for Collection spotlight (up to 6, best grades first)
    supabase
      .from("collection_items")
      .select("id, grader, grade, condition, cards(name, set_name, card_number, image_url)")
      .eq("user_id", profile.id)
      .not("grader", "is", null)
      .order("grade", { ascending: false })
      .limit(6),

    // Featured card (conditional — resolves to null if none set)
    featuredItemId
      ? supabase
          .from("collection_items")
          .select("id, condition, grader, grade, cards(name, set_name, card_number, image_url, game_data)")
          .eq("id", featuredItemId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Wishlist
    supabase
      .from("wishlist_items")
      .select("id, card_name, set_name, card_number, image_url, notes")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),

    // Follower count
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", profile.id),

    // Following count
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", profile.id),

    // Current user's follow state
    user
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", user.id)
          .eq("following_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Does the viewed profile follow the current user back?
    user
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", profile.id)
          .eq("following_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Who the current user follows (for mutual followers)
    user
      ? supabase.from("follows").select("following_id").eq("follower_id", user.id)
      : Promise.resolve({ data: null, error: null }),

    // Current user's wishlist (for cross-referencing against this profile's listings)
    user && !isOwnProfile
      ? supabase.from("wishlist_items").select("card_name, set_name, pokemon_api_id").eq("user_id", user.id)
      : Promise.resolve({ data: null, error: null }),

    // Achievement badges earned by this profile
    supabase.from("user_badges").select("badge_slug, earned_at").eq("user_id", profile.id),

    // Collections created by this user
    supabase
      .from("collections")
      .select("id, name, type, card_total, created_at, collection_entries(count)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);

  // ── Compute stats ──────────────────────────────────────────────────────────

  const vaultItems  = allItems ?? [];

  // Public showcase — cards the user pinned via /showcase/edit, shown in their own tab.
  const { data: showcasePins } = await supabase
    .from("profile_showcase")
    .select("collection_item_id")
    .eq("user_id", profile.id);
  const showcasePinIds = new Set((showcasePins ?? []).map((s) => s.collection_item_id));
  const showcaseItems  = vaultItems.filter((i) => showcasePinIds.has((i as any).id));
  const showcaseBorder = ((profile as any).showcase_border as string | null) ?? "none";
  const showcaseBorderClass =
    showcaseBorder === "foil" ? "showcase-foil" : showcaseBorder === "gold" ? "showcase-gold" : "";
  const totalCards  = vaultItems.reduce((s, r) => s + ((r as any).quantity ?? 1), 0);
  const gradedCount = vaultItems.filter((r) => !!(r as any).grader).length;

  const setNames = new Set<string>();
  vaultItems.forEach((r) => {
    const raw   = (r as any).cards;
    const cards = Array.isArray(raw) ? raw : raw ? [raw] : [];
    cards.forEach((c: any) => { if (c?.set_name) setNames.add(c.set_name); });
  });
  const uniqueSets = setNames.size;

  const activeCardListings   = cardListings?.length   ?? 0;
  const activeSealedListings = sealedListings?.length ?? 0;
  const activeListings       = activeCardListings + activeSealedListings;
  const forTradeCount        =
    (cardListings?.filter((l) => l.for_trade).length   ?? 0) +
    (sealedListings?.filter((l) => l.for_trade).length ?? 0);

  const isFollowing    = !!followState;
  const followsYouBack = !!followsYouBackState;
  const myFollowingIds = (myFollowingData ?? []).map((f: any) => f.following_id as string);

  // Mutual followers: people I follow who also follow this profile (up to 2 named + count)
  const { data: mutualData } = myFollowingIds.length > 0 && !isOwnProfile
    ? await supabase
        .from("follows")
        .select("follower_id, profiles(username)")
        .eq("following_id", profile.id)
        .in("follower_id", myFollowingIds)
        .limit(3)
    : { data: null };
  const mutuals = (mutualData ?? []).map((m: any) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return p?.username as string | undefined;
  }).filter(Boolean) as string[];

  // Wishlist cross-referencing: which of this profile's listings are on my wishlist?
  const myWishlistApiIds = new Set(
    (myWishlistData ?? []).map((w: any) => w.pokemon_api_id as string | null).filter(Boolean)
  );
  const wishlistMatchListings = !isOwnProfile
    ? (cardListings ?? []).filter((l) => {
        const card = Array.isArray(l.cards) ? l.cards[0] : l.cards;
        const apiId = (card?.game_data as any)?.pokemon_api_id as string | undefined;
        return apiId && myWishlistApiIds.has(apiId);
      })
    : [];

  const profileBadges = (profileBadgeData ?? []).map((b) => ({
    badge_slug: b.badge_slug as string,
    earned_at: b.earned_at as string,
  }));

  // ── Collections ────────────────────────────────────────────────────────────

  type CollectionRow = {
    id: string;
    name: string;
    type: string;
    card_total: number | null;
    created_at: string;
    collection_entries: { count: number }[];
  };
  const userCollections = (showcaseData ?? []) as unknown as CollectionRow[];

  const { data: featuredBadgeData } = await supabase
    .from("profiles")
    .select("featured_badge_slugs")
    .eq("id", profile.id)
    .single();
  const featuredBadgeSlugs = (featuredBadgeData as any)?.featured_badge_slugs as string[] ?? [];

  const cardListingsWithSeller   = (cardListings   ?? []).map((l) => ({ ...l, seller_username: profile.username }));
  const sealedListingsWithSeller = (sealedListings ?? []).map((l) => ({ ...l, seller_username: profile.username }));
  const watchedItemIds           = watchlistData?.map((w) => w.item_id) ?? [];

  // ── Featured card data ─────────────────────────────────────────────────────

  const featuredRaw  = (featuredResult as any)?.data ?? null;
  const featuredCard = featuredRaw
    ? (() => {
        const raw = (featuredRaw as any).cards;
        return Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
      })()
    : null;

  // ── Spotlight items (graded, for Collection tab) ───────────────────────────

  const spotlight = (spotlightItems ?? []).map((item) => {
    const raw  = (item as any).cards;
    const card = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    return { ...item, card };
  });

  // ── Avatar ─────────────────────────────────────────────────────────────────

  const customHex  = storedColor && isHexColor(storedColor) ? storedColor : null;
  const avatar     = customHex ? null : AVATAR_COLORS[resolveAvatarColor(storedColor, profile.username)];
  const initial    = profile.username.charAt(0).toUpperCase();

  // ── Vault tab content ──────────────────────────────────────────────────────

  const VAULT_LIMIT = 200;
  const vaultContent = (
    <div className="space-y-4">
      {vaultItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-12 text-center">
          <p className="text-sm text-foreground-muted">
            {isOwnProfile ? "Add cards to your inventory to see them here." : "This collector hasn't added any cards yet."}
          </p>
          {isOwnProfile && (
            <Link
              href="/inventory/add"
              className="mt-3 inline-block rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
            >
              Add a card
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {vaultItems.slice(0, VAULT_LIMIT).map((item) => {
              const raw  = (item as any).cards;
              const card = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
              return (
                <div
                  key={(item as any).id}
                  className="rounded-xl border border-border bg-surface p-2 flex flex-col gap-2 hover:border-gold/30 transition-colors"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised">
                    {card?.image_url ? (
                      <Image
                        src={card.image_url}
                        alt={card.name ?? "Card"}
                        fill
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                        className="object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-foreground-muted text-sm font-medium">
                        {card?.name?.[0] ?? "?"}
                      </div>
                    )}
                    {((item as any).for_sale || (item as any).for_trade) && (
                      <div className="absolute bottom-1 left-1 flex gap-0.5">
                        {(item as any).for_sale  && <span className="rounded-sm bg-emerald-500/80 px-1 py-0.5 text-[9px] font-semibold text-white leading-none">$</span>}
                        {(item as any).for_trade && <span className="rounded-sm bg-blue-500/80    px-1 py-0.5 text-[9px] font-semibold text-white leading-none">T</span>}
                      </div>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-foreground truncate leading-tight">{card?.name ?? "—"}</p>
                    <p className="text-xs text-foreground-muted truncate">{card?.set_name ?? "—"}</p>
                    {(item as any).grader ? (
                      <p className="text-xs text-gold">{(item as any).grader} {(item as any).grade}</p>
                    ) : (item as any).condition ? (
                      <p className="text-xs text-foreground-muted capitalize">{((item as any).condition as string).replace(/_/g, " ")}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {vaultItems.length > VAULT_LIMIT && (
            <p className="text-xs text-foreground-muted text-center">
              Showing first {VAULT_LIMIT} of {totalCards} cards
            </p>
          )}
        </>
      )}
    </div>
  );

  // ── Listings tab content ───────────────────────────────────────────────────

  const showcaseContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {showcaseItems.map((item) => {
          const raw  = (item as any).cards;
          const card = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
          return (
            <div
              key={(item as any).id}
              className={`rounded-xl border border-border bg-surface p-2 flex flex-col gap-2 ${showcaseBorderClass}`}
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised">
                {card?.image_url ? (
                  <Image
                    src={card.image_url}
                    alt={card.name ?? "Card"}
                    fill
                    sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                    className="object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-foreground-muted text-sm font-medium">
                    {card?.name?.[0] ?? "?"}
                  </div>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground truncate leading-tight">{card?.name ?? "—"}</p>
                <p className="text-xs text-foreground-muted truncate">{card?.set_name ?? "—"}</p>
                {(item as any).grader ? (
                  <p className="text-xs text-gold">{(item as any).grader} {(item as any).grade}</p>
                ) : (item as any).condition ? (
                  <p className="text-xs text-foreground-muted capitalize">{((item as any).condition as string).replace(/_/g, " ")}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {isOwnProfile && (
        <div className="text-center">
          <Link href="/showcase/edit" className="text-xs text-gold hover:text-gold-light transition-colors">
            Edit showcase →
          </Link>
        </div>
      )}
    </div>
  );

  const listingsContent = (
    <div className="space-y-8">
      {/* Card Listings */}
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground">
          Card Listings
          <span className="ml-2 text-sm font-normal text-foreground-muted">({activeCardListings})</span>
        </h3>
        {cardListingsWithSeller.length > 0 ? (
          <MarketplaceGrid
            listings={cardListingsWithSeller}
            currentUserId={user?.id ?? ""}
            initialWatchedIds={watchedItemIds}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-surface py-10 text-center">
            <p className="text-sm text-foreground-muted">
              {isOwnProfile
                ? "Mark cards as For Sale or For Trade in your inventory to list them here."
                : "No cards listed."}
            </p>
            {isOwnProfile && (
              <Link
                href="/inventory"
                className="mt-3 inline-block rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
              >
                Go to Inventory
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Sealed Products — hide if empty and not own profile */}
      {(activeSealedListings > 0 || isOwnProfile) && (
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground">
            Sealed Products
            <span className="ml-2 text-sm font-normal text-foreground-muted">({activeSealedListings})</span>
          </h3>
          {sealedListingsWithSeller.length > 0 ? (
            <SealedProductsGrid listings={sealedListingsWithSeller} currentUserId={user?.id ?? ""} />
          ) : (
            <div className="rounded-2xl border border-border bg-surface py-10 text-center">
              <p className="text-sm text-foreground-muted">
                Mark sealed products as For Sale or For Trade in your inventory to list them here.
              </p>
              <Link
                href="/inventory/products"
                className="mt-3 inline-block rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
              >
                Go to Products
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Collections tab content ────────────────────────────────────────────────

  const TYPE_COLORS: Record<string, string> = {
    set:    "border-blue-500/30 bg-blue-500/10 text-blue-400",
    rarity: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    custom: "border-border bg-surface-raised text-foreground-muted",
  };
  const TYPE_LABELS: Record<string, string> = {
    set:    "Set",
    rarity: "Rarity",
    custom: "Custom",
  };

  const collectionContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">
          Collections
          <span className="ml-2 text-sm font-normal text-foreground-muted">({userCollections.length})</span>
        </h3>
        {isOwnProfile && (
          <Link
            href="/collections/new"
            className="text-xs font-medium text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New
          </Link>
        )}
      </div>

      {userCollections.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface py-12 text-center">
          <p className="text-sm text-foreground-muted">
            {isOwnProfile
              ? "Track set completion, rarity hunts, and custom lists."
              : "This collector hasn't created any collections yet."}
          </p>
          {isOwnProfile && (
            <Link
              href="/collections/new"
              className="mt-3 inline-block rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
            >
              Create a collection
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {userCollections.map((col) => {
            const count = (col.collection_entries?.[0] as any)?.count ?? 0;
            return (
              <Link
                key={col.id}
                href={`/collections/${col.id}`}
                className="rounded-xl border border-border bg-surface p-4 hover:border-gold/30 transition-colors flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{col.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[col.type]}`}>
                      {TYPE_LABELS[col.type]}
                    </span>
                    <span className="text-xs text-foreground-muted">
                      {col.type === "set" && col.card_total ? `${count} / ${col.card_total}` : `${count} ${count === 1 ? "card" : "cards"}`}
                    </span>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            "mainEntity": {
              "@type": "Person",
              "name": `@${profile.username}`,
              "url": `https://vaultset.app/profile/${profile.username}`,
              ...(bio ? { "description": bio } : {}),
              ...(specialty ? { "knowsAbout": specialty } : {}),
            },
          }),
        }}
      />

      {/* Back */}
      <Link
        href="/community"
        className="text-sm text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1.5 w-fit"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Community
      </Link>

      {/* Profile header */}
      <div className="rounded-2xl border border-border bg-surface p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={profile.username}
            className="h-16 w-16 shrink-0 rounded-full object-cover border border-border"
          />
        ) : customHex ? (
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-2xl font-bold select-none"
            style={{ background: customHex + "22", borderColor: customHex + "66", color: customHex }}
          >
            {initial}
          </div>
        ) : (
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-2xl font-bold select-none ${avatar!.bg} ${avatar!.border} ${avatar!.text}`}>
            {initial}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">@{profile.username}</h1>
            {isProSubscriber(profile as any) && <ProBadge />}
            {profile.is_supporter && <SupporterBadge />}
            {user && !isOwnProfile && followsYouBack && (
              <span className="inline-flex items-center rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
                Follows you
              </span>
            )}
            {specialty && (
              <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                {specialty}
              </span>
            )}
          </div>
          {isProSubscriber(profile as any) && (
            <div className="mt-0.5">
              <ProTitle />
            </div>
          )}
          <p className="mt-0.5 text-sm text-foreground-muted flex items-center gap-3 flex-wrap">
            <span>Joined {timeAgo(profile.created_at)}</span>
            {city && (
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {city}
              </span>
            )}
            <Link href={`/profile/${profile.username}/followers`} className="hover:text-foreground transition-colors">
              <span className="font-semibold text-foreground">{followerCount ?? 0}</span>
              {" "}Followers
            </Link>
            <Link href={`/profile/${profile.username}/following`} className="hover:text-foreground transition-colors">
              <span className="font-semibold text-foreground">{followingCount ?? 0}</span>
              {" "}Following
            </Link>
          </p>
          {bio && !isAdmin && (
            <p className="mt-2 text-sm text-foreground-muted leading-relaxed max-w-prose">{bio}</p>
          )}
          {mutuals.length > 0 && !isOwnProfile && (
            <p className="mt-1.5 text-xs text-foreground-muted">
              Followed by{" "}
              {mutuals.slice(0, 2).map((u, i) => (
                <span key={u}>
                  {i > 0 && ", "}
                  <Link href={`/profile/${u}`} className="font-medium text-foreground hover:text-gold transition-colors">@{u}</Link>
                </span>
              ))}
              {mutuals.length > 2 && ` and ${mutuals.length - 2} other${mutuals.length - 2 !== 1 ? "s" : ""} you follow`}
              {mutuals.length <= 2 && " you follow"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <ShareProfileButton username={profile.username} />
          {user && !isOwnProfile && (
            <FollowButton
              profileId={profile.id}
              initialIsFollowing={isFollowing}
            />
          )}
          {user && !isOwnProfile && <MessageButton recipientId={profile.id} label="Message" />}
          {user && !isOwnProfile && <ReportButton reportedUserId={profile.id} />}
          {isOwnProfile && (
            <Link
              href="/account"
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
            >
              Edit profile
            </Link>
          )}
        </div>
      </div>

      {/* Admin bio — full-width, larger display */}
      {isAdmin && bio && (
        <div className="rounded-2xl border border-gold/20 bg-surface p-6">
          <p className="text-base text-foreground leading-relaxed">{parseBio(bio)}</p>
        </div>
      )}

      {/* Wishlist cross-reference */}
      {wishlistMatchListings.length > 0 && (
        <div className="rounded-2xl border border-gold/20 bg-gold/5 px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gold shrink-0">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <p className="text-sm text-foreground">
              <span className="font-semibold text-gold">{wishlistMatchListings.length}</span>
              {" "}card{wishlistMatchListings.length !== 1 ? "s" : ""} on your wishlist{" "}
              {wishlistMatchListings.length !== 1 ? "are" : "is"} listed here
            </p>
          </div>
          <Link
            href={`/marketplace/user/${profile.username}`}
            className="text-xs font-medium text-gold hover:text-gold-light transition-colors shrink-0"
          >
            View listings →
          </Link>
        </div>
      )}

      {/* Featured card */}
      {featuredCard && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-gold" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Featured Card</span>
          </div>
          <div className="flex items-center gap-4">
            {featuredCard.image_url ? (
              <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-surface-raised">
                <Image
                  src={featuredCard.image_url}
                  alt={featuredCard.name ?? "Featured card"}
                  fill
                  sizes="80px"
                  className="object-contain"
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{featuredCard.name}</p>
              <p className="text-sm text-foreground-muted">
                {featuredCard.set_name}
                {featuredCard.card_number ? ` · ${featuredCard.card_number}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {featuredRaw?.grader ? (
                  <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                    {featuredRaw.grader} {featuredRaw.grade}
                  </span>
                ) : featuredRaw?.condition ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted capitalize">
                    {featuredRaw.condition.replace(/_/g, " ")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collections — read-only display */}
      {userCollections.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide">Collections</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {userCollections.map((col) => {
              const count = (col.collection_entries?.[0] as any)?.count ?? 0;
              return (
                <Link
                  key={col.id}
                  href={`/collections/${col.id}`}
                  className="rounded-xl border border-border bg-surface px-4 py-3 hover:border-gold/30 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{col.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[col.type]}`}>
                        {TYPE_LABELS[col.type]}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        {col.type === "set" && col.card_total ? `${count} / ${col.card_total}` : `${count} ${count === 1 ? "card" : "cards"}`}
                      </span>
                    </div>
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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Cards",     value: totalCards,     href: null },
          { label: "Unique Sets",     value: uniqueSets,     href: null },
          { label: "Graded",          value: gradedCount,    href: null },
          { label: "Active Listings", value: activeListings, href: `/marketplace/user/${profile.username}` },
          { label: "For Trade",       value: forTradeCount,  href: null },
        ].map(({ label, value, href }) => {
          const card = (
            <div className={`rounded-2xl border border-border bg-surface p-5 text-center ${href ? "hover:border-gold/30 transition-colors" : ""}`}>
              <p className="text-3xl font-bold text-gold">{value}</p>
              <p className="mt-1 text-xs text-foreground-muted">{label}</p>
              {href && <p className="mt-0.5 text-xs text-foreground-muted opacity-60">View →</p>}
            </div>
          );
          return href
            ? <Link key={label} href={href}>{card}</Link>
            : <div key={label}>{card}</div>;
        })}
      </div>

      {/* Achievement badges */}
      <BadgeBoard
        earnedBadges={profileBadges}
        isOwnProfile={isOwnProfile}
        profileUserId={profile.id}
        initialFeaturedSlugs={featuredBadgeSlugs}
      />

      {/* Tabbed content */}
      <ProfileTabs
        showcaseCount={showcaseItems.length}
        listingCount={activeListings}
        vaultCount={vaultItems.length}
        collectionCount={userCollections.length}
        wishlistCount={wishlistItems?.length ?? 0}
        showcaseContent={showcaseItems.length > 0 ? showcaseContent : undefined}
        listingsContent={listingsContent}
        vaultContent={vaultContent}
        collectionContent={collectionContent}
        wishlistContent={
          <div className="space-y-4">
            {!wishlistItems || wishlistItems.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface py-12 text-center">
                <p className="text-sm text-foreground-muted">
                  {isOwnProfile
                    ? "Add cards you're hunting for so sellers can find you."
                    : "This collector hasn't added any cards to their wishlist yet."}
                </p>
                {isOwnProfile && (
                  <Link
                    href="/wishlist/add"
                    className="mt-3 inline-block rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
                  >
                    Add cards
                  </Link>
                )}
              </div>
            ) : (
              <>
                {user && !isOwnProfile && (
                  <p className="text-sm text-foreground-muted">
                    This collector is looking for these cards — if you have one,{" "}
                    <Link href={`/messages`} className="text-gold hover:text-gold-light transition-colors">
                      send them a message
                    </Link>
                    .
                  </p>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {wishlistItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-surface p-2 flex flex-col gap-2 hover:border-gold/30 transition-colors"
                    >
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised">
                        {item.image_url ? (
                          <Image
                            src={item.image_url}
                            alt={item.card_name}
                            fill
                            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                            className="object-contain"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-foreground-muted text-xs">
                            {item.card_name[0]}
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-foreground truncate leading-tight">
                          {item.card_name}
                        </p>
                        <p className="text-xs text-foreground-muted truncate">{item.set_name}</p>
                        {item.notes && (
                          <p className="text-xs text-foreground-muted italic truncate">{item.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {isOwnProfile && (
                  <div className="flex justify-end">
                    <Link
                      href="/wishlist"
                      className="text-xs text-foreground-muted hover:text-gold transition-colors"
                    >
                      Manage wishlist →
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        }
      />

    </div>
  );
}
