import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import { SupporterBadge } from "@/components/SupporterBadge";
import { timeAgo } from "@/lib/timeAgo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();

  const { data: seller } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", username)
    .single();

  if (!seller) return { title: "Seller Not Found", robots: { index: false } };

  const title = `@${seller.username}'s Listings`;
  const description = `Browse trading cards and sealed products listed by @${seller.username} on Vaultset Marketplace.`;

  return {
    title,
    description,
    robots: { index: false },
    openGraph: {
      title,
      description,
      type: "profile",
    },
  };
}

export default async function UserListingsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolve seller profile by username
  const { data: seller } = await supabase
    .from("profiles")
    .select("id, username, created_at, is_supporter")
    .eq("username", username)
    .single();

  if (!seller) redirect("/marketplace");

  // Fetch seller's public listings
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
    .eq("user_id", seller.id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .eq("on_hold", false)
    .order("created_at", { ascending: false });

  const listingsWithSeller = (listings ?? []).map((l) => ({
    ...l,
    seller_username: seller.username,
  }));

  // Current user's watchlist
  const { data: watchlistData } = await supabase
    .from("watchlist")
    .select("item_id")
    .eq("user_id", user.id);

  const watchedItemIds = watchlistData?.map((w) => w.item_id) ?? [];

  const joinedDate = timeAgo(seller.created_at);

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/marketplace"
              className="text-sm text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Marketplace
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 flex-wrap">
            Listings by <span className="text-gold">@{seller.username}</span>
            {seller.is_supporter && <SupporterBadge />}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Member since {joinedDate} · {listingsWithSeller.length} active {listingsWithSeller.length === 1 ? "listing" : "listings"}
          </p>
        </div>
      </div>

      <MarketplaceGrid
        listings={listingsWithSeller}
        currentUserId={user.id}
        initialWatchedIds={watchedItemIds}
      />
    </div>
  );
}
