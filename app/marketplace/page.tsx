import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import { SealedProductsGrid } from "@/components/SealedProductsGrid";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Browse trading cards and sealed products listed for sale and trade. Find Pokémon TCG, MTG, and more from collectors on Vaultset.",
  alternates: { canonical: "/marketplace" },
  openGraph: {
    title: "Marketplace — Vaultset",
    description:
      "Browse trading cards and sealed products listed for sale and trade by collectors worldwide.",
    type: "website",
  },
};

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: initialFilter } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const listingSelect = `
    id, user_id, condition, finish, for_sale, for_trade,
    list_price, grader, grade, quantity, created_at,
    cards ( id, game, name, set_name, card_number, year, image_url, game_data )
  `;

  const [{ data: listings }, { data: myListingsRaw }] = await Promise.all([
    supabase
      .from("collection_items")
      .select(listingSelect)
      .or("for_sale.eq.true,for_trade.eq.true")
      .eq("on_hold", false)
      .neq("user_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(200),
    user
      ? supabase
          .from("collection_items")
          .select(listingSelect)
          .or("for_sale.eq.true,for_trade.eq.true")
          .eq("on_hold", false)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  // Fetch seller usernames for all unique user_ids (include current user for the "Your Listings" bar)
  const userIds = [...new Set([
    ...(listings?.map((l) => l.user_id) ?? []),
    ...(user ? [user.id] : []),
  ])];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, username").in("id", userIds).eq("banned", false)
    : { data: [] };

  const profileMap = new Map(profiles?.map((p) => [p.id, p.username]) ?? []);

  const listingsWithSellers = (listings ?? [])
    .filter((l) => profileMap.has(l.user_id))
    .map((l) => ({
      ...l,
      seller_username: profileMap.get(l.user_id) ?? "Unknown",
    }));

  const myListingsWithSeller = (myListingsRaw ?? []).map((l) => ({
    ...l,
    seller_username: user ? (profileMap.get(user.id) ?? "Unknown") : "Unknown",
  }));

  // Sealed product listings
  const { data: sealedListings } = await supabase
    .from("product_purchases")
    .select("id, user_id, name, product_type, cost, for_sale, for_trade, list_price, purchased_at, notes")
    .or("for_sale.eq.true,for_trade.eq.true")
    .neq("user_id", user?.id ?? "")
    .order("created_at", { ascending: false });

  const sealedUserIds = [...new Set(sealedListings?.map((l) => l.user_id) ?? [])];
  const { data: sealedProfiles } = sealedUserIds.length
    ? await supabase.from("profiles").select("id, username").in("id", sealedUserIds).eq("banned", false)
    : { data: [] };
  const sealedProfileMap = new Map(sealedProfiles?.map((p) => [p.id, p.username]) ?? []);

  const sealedWithSellers = (sealedListings ?? [])
    .filter((l) => sealedProfileMap.has(l.user_id))
    .map((l) => ({
      ...l,
      seller_username: sealedProfileMap.get(l.user_id) ?? "Unknown",
    }));

  // Current user's watched item IDs, wishlist, follows, and seller follower counts
  const [
    { data: watchlistData },
    { data: wishlistItems },
    { data: myFollowsData },
    { data: allFollowRows },
  ] = await Promise.all([
    supabase.from("watchlist").select("item_id").eq("user_id", user?.id ?? ""),
    user
      ? supabase.from("wishlist_items").select("pokemon_api_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from("follows").select("following_id").eq("follower_id", user.id)
      : Promise.resolve({ data: [] }),
    supabase.from("follows").select("following_id"),
  ]);

  const watchedItemIds  = watchlistData?.map((w) => w.item_id) ?? [];
  const wishedApiIds    = (wishlistItems ?? []).map((w) => w.pokemon_api_id).filter(Boolean) as string[];
  const followingUserIds = (myFollowsData ?? []).map((f) => f.following_id);

  const followerCountMap: Record<string, number> = {};
  (allFollowRows ?? []).forEach((f) => {
    followerCountMap[f.following_id] = (followerCountMap[f.following_id] ?? 0) + 1;
  });

  // Build per-seller follower count using user_id
  const sellerFollowerCounts: Record<string, number> = {};
  userIds.forEach((id) => {
    if (followerCountMap[id]) sellerFollowerCounts[id] = followerCountMap[id];
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Marketplace</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Browse cards listed for sale and trade across the community.
        </p>
      </div>

      <MarketplaceGrid
        listings={listingsWithSellers}
        myListings={myListingsWithSeller}
        currentUserId={user?.id ?? ""}
        initialWatchedIds={watchedItemIds}
        wishedApiIds={wishedApiIds}
        followingUserIds={followingUserIds}
        sellerFollowerCounts={sellerFollowerCounts}
        initialFilter={initialFilter}
      />

      {sealedWithSellers.length > 0 && (
        <div className="space-y-4">
          <div className="border-t border-border pt-8">
            <h2 className="text-lg font-bold text-foreground">Sealed Products</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Unopened ETBs, booster boxes, and bundles listed for sale.
            </p>
          </div>
          <SealedProductsGrid
            listings={sealedWithSellers}
            currentUserId={user?.id ?? ""}
          />
        </div>
      )}
    </div>
  );
}
