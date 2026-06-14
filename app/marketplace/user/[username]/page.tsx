import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { MarketplaceGrid } from "@/components/MarketplaceGrid";
import { SupporterBadge } from "@/components/SupporterBadge";
import { ProBadge, ProTitle } from "@/components/ProBadge";
import { isProSubscriber } from "@/lib/proStatus";
import { isOnVacation, vacationReturnDate } from "@/lib/vacation";
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

  const title       = `@${seller.username}'s Listings`;
  const description = `Browse trading cards and sealed products listed by @${seller.username} on Vaultset Marketplace.`;

  return {
    title,
    description,
    alternates: { canonical: `/marketplace/user/${seller.username}` },
    openGraph: { title, description, type: "profile" },
  };
}

export default async function UserListingsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // No auth redirect — seller storefronts are publicly crawlable

  const { data: seller } = await supabase
    .from("profiles")
    .select("id, username, created_at, is_supporter, is_pro, pro_plan, pro_expires_at, vacation_mode, vacation_message, vacation_starts_at, vacation_ends_at")
    .eq("username", username)
    .single();

  if (!seller) redirect("/marketplace");

  const onVacation = isOnVacation(seller as any);
  const isOwner    = user?.id === seller.id;
  const returnDate = vacationReturnDate(seller as any);

  const { data: listings } = await supabase
    .from("collection_items")
    .select(`
      id, user_id, condition, finish, for_sale, for_trade,
      list_price, grader, grade, quantity, created_at,
      cards ( id, game, name, set_name, card_number, year, image_url, game_data )
    `)
    .eq("user_id", seller.id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .eq("on_hold", false)
    .order("created_at", { ascending: false });

  // On vacation, the storefront is hidden from buyers; the owner still sees their listings.
  const listingsWithSeller = (onVacation && !isOwner ? [] : (listings ?? [])).map((l) => ({
    ...l,
    seller_username: seller.username,
  }));

  const [{ data: watchlistData }, { data: wishlistItems }] = await Promise.all([
    user
      ? supabase.from("watchlist").select("item_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from("wishlist_items").select("pokemon_api_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
  ]);

  const watchedItemIds = watchlistData?.map((w) => w.item_id) ?? [];
  const wishedApiIds   = (wishlistItems ?? []).map((w) => w.pokemon_api_id).filter(Boolean) as string[];
  const joinedDate     = timeAgo(seller.created_at);

  return (
    <div className="space-y-8">
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
            {isProSubscriber(seller as any) && <ProBadge />}
            {seller.is_supporter && <SupporterBadge />}
          </h1>
          {isProSubscriber(seller as any) && (
            <div className="mt-1">
              <ProTitle />
            </div>
          )}
          <p className="mt-1 text-sm text-foreground-muted">
            Member since {joinedDate} · {listingsWithSeller.length} active {listingsWithSeller.length === 1 ? "listing" : "listings"}
          </p>
        </div>
      </div>

      {onVacation && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 px-5 py-4 flex items-start gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 mt-0.5 flex-shrink-0">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-400">
              @{seller.username} is on vacation — listings are paused
            </p>
            {(seller as any).vacation_message ? (
              <p className="mt-0.5 text-sm text-foreground-muted">{(seller as any).vacation_message}</p>
            ) : (
              <p className="mt-0.5 text-xs text-foreground-muted">
                {returnDate
                  ? `Listings will return ${returnDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
                  : "Check back soon — this seller will relist when they return."}
              </p>
            )}
            {isOwner && (
              <p className="mt-1 text-xs text-foreground-muted">
                Only you can see your listings below. They&apos;re hidden from buyers until you turn pause off in{" "}
                <Link href="/account" className="text-gold hover:text-gold-light transition-colors">account settings</Link>.
              </p>
            )}
          </div>
        </div>
      )}

      <MarketplaceGrid
        listings={listingsWithSeller}
        currentUserId={user?.id ?? ""}
        initialWatchedIds={watchedItemIds}
        wishedApiIds={wishedApiIds}
      />
    </div>
  );
}
