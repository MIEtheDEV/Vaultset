import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import { SealedProductsGrid } from "@/components/SealedProductsGrid";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Browse trading cards and sealed products listed for sale and trade. Find Pokémon TCG, MTG, and more from collectors on Vaultset.",
  robots: { index: false },
  openGraph: {
    title: "Marketplace — Vaultset",
    description:
      "Browse trading cards and sealed products listed for sale and trade by collectors worldwide.",
    type: "website",
  },
};

export default async function MarketplacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: listings } = await supabase
    .from("collection_items")
    .select(`
      id,
      user_id,
      condition,
      finish,
      for_sale,
      for_trade,
      list_price,
      grader,
      grade,
      quantity,
      created_at,
      cards (
        id,
        game,
        name,
        set_name,
        card_number,
        year,
        image_url,
        game_data
      )
    `)
    .or("for_sale.eq.true,for_trade.eq.true")
    .eq("on_hold", false)
    .order("created_at", { ascending: false })
    .limit(200);

  // Fetch seller usernames for all unique user_ids
  const userIds = [...new Set(listings?.map((l) => l.user_id) ?? [])];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, username").in("id", userIds)
    : { data: [] };

  const profileMap = new Map(profiles?.map((p) => [p.id, p.username]) ?? []);

  const listingsWithSellers = (listings ?? []).map((l) => ({
    ...l,
    seller_username: profileMap.get(l.user_id) ?? "Unknown",
  }));

  // Sealed product listings
  const { data: sealedListings } = await supabase
    .from("product_purchases")
    .select("id, user_id, name, product_type, cost, for_sale, for_trade, list_price, purchased_at, notes")
    .or("for_sale.eq.true,for_trade.eq.true")
    .order("created_at", { ascending: false });

  const sealedUserIds = [...new Set(sealedListings?.map((l) => l.user_id) ?? [])];
  const { data: sealedProfiles } = sealedUserIds.length
    ? await supabase.from("profiles").select("id, username").in("id", sealedUserIds)
    : { data: [] };
  const sealedProfileMap = new Map(sealedProfiles?.map((p) => [p.id, p.username]) ?? []);

  const sealedWithSellers = (sealedListings ?? []).map((l) => ({
    ...l,
    seller_username: sealedProfileMap.get(l.user_id) ?? "Unknown",
  }));

  // Current user's watched item IDs and wishlist
  const [
    { data: watchlistData },
    { data: wishlistItems },
  ] = await Promise.all([
    supabase.from("watchlist").select("item_id").eq("user_id", user?.id ?? ""),
    user
      ? supabase.from("wishlist_items").select("pokemon_api_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
  ]);

  const watchedItemIds = watchlistData?.map((w) => w.item_id) ?? [];
  const wishedApiIds = (wishlistItems ?? []).map((w) => w.pokemon_api_id).filter(Boolean) as string[];

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
        currentUserId={user?.id ?? ""}
        initialWatchedIds={watchedItemIds}
        wishedApiIds={wishedApiIds}
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
