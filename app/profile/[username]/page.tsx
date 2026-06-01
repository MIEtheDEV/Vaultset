import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import { SealedProductsGrid } from "@/components/SealedProductsGrid";
import { SupporterBadge } from "@/components/SupporterBadge";
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
  const description = `Browse @${username}'s trading card collection, active listings, and wishlist on Vaultset.`;
  return {
    title: `@${username}'s Profile`,
    description,
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
    .select("id, username, created_at, is_supporter, bio, specialty, city, featured_item_id, avatar_url, avatar_color")
    .eq("username", username)
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
  ] = await Promise.all([
    // All collection items for stats (total cards, graded count, unique sets)
    supabase
      .from("collection_items")
      .select("quantity, grader, cards(set_name)")
      .eq("user_id", profile.id),

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
  ]);

  // ── Compute stats ──────────────────────────────────────────────────────────

  const totalCards  = allItems?.reduce((s, r) => s + (r.quantity ?? 1), 0) ?? 0;
  const gradedCount = allItems?.filter((r) => !!(r as any).grader).length ?? 0;

  const setNames = new Set<string>();
  allItems?.forEach((r) => {
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

  // ── Listings tab content ───────────────────────────────────────────────────

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

  // ── Collection tab content ─────────────────────────────────────────────────

  const collectionContent = (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground">
        Graded Cards
        <span className="ml-2 text-sm font-normal text-foreground-muted">({spotlight.length})</span>
      </h3>
      {spotlight.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {spotlight.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-surface p-2 flex flex-col gap-2 hover:border-gold/30 transition-colors"
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised">
                {item.card?.image_url ? (
                  <Image
                    src={item.card.image_url}
                    alt={item.card.name ?? "Card"}
                    fill
                    sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                    className="object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-foreground-muted text-xs">
                    {item.card?.name?.[0] ?? "?"}
                  </div>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground truncate leading-tight">
                  {item.card?.name ?? "—"}
                </p>
                <p className="text-xs text-foreground-muted truncate">{item.card?.set_name ?? ""}</p>
                {(item as any).grader && (
                  <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-xs font-semibold text-gold">
                    {(item as any).grader} {(item as any).grade}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface py-12 text-center">
          <p className="text-sm text-foreground-muted">
            {isOwnProfile
              ? "Add graded cards to your inventory to showcase them here."
              : "This collector has no graded cards to display."}
          </p>
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
            {profile.is_supporter && <SupporterBadge />}
            {specialty && (
              <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                {specialty}
              </span>
            )}
          </div>
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
              followsYouBack={followsYouBack}
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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Cards",     value: totalCards     },
          { label: "Unique Sets",     value: uniqueSets     },
          { label: "Graded",          value: gradedCount    },
          { label: "Active Listings", value: activeListings },
          { label: "For Trade",       value: forTradeCount  },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-5 text-center">
            <p className="text-3xl font-bold text-gold">{value}</p>
            <p className="mt-1 text-xs text-foreground-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabbed content */}
      <ProfileTabs
        listingCount={activeListings}
        collectionCount={spotlight.length}
        wishlistCount={wishlistItems?.length ?? 0}
        listingsContent={listingsContent}
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
