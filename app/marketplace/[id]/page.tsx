import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ListingDetail } from "@/components/ListingDetail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("collection_items")
    .select("condition, finish, list_price, cards(name, set_name, image_url)")
    .eq("id", id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .single();

  if (!listing) return { title: "Listing Not Found", robots: { index: false } };
  const card = Array.isArray(listing.cards) ? listing.cards[0] : listing.cards;
  if (!card) return { title: "Listing", robots: { index: false } };

  const finish = (listing as Record<string, unknown>).finish as string | null;
  const conditionParts = [listing.condition, finish].filter(Boolean).join(" ");
  const title = card.name;
  const description = `${card.name} from ${card.set_name}${listing.list_price != null ? ` for $${listing.list_price}` : ""}. ${conditionParts} condition. Available on Vaultset Marketplace.`;

  return {
    title,
    description,
    robots: { index: false },
    openGraph: {
      title: `${title} — Vaultset`,
      description,
      type: "website",
      images: card.image_url
        ? [{ url: card.image_url, alt: card.name }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: card.image_url ? [card.image_url] : [],
    },
  };
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the listing — allow on-hold listings so buyer/seller can still view the status
  const { data: listing } = await supabase
    .from("collection_items")
    .select(`
      id, user_id, condition, finish, for_sale, for_trade,
      list_price, quantity, grader, grade, cert_number, notes, created_at, on_hold,
      cards (
        id, game, name, set_name, set_code, card_number, year, image_url, game_data
      )
    `)
    .eq("id", id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .single();

  if (!listing) redirect("/marketplace");

  const card = Array.isArray(listing.cards) ? listing.cards[0] : listing.cards;
  if (!card) redirect("/marketplace");

  // Seller profile (including follow-gate setting)
  const { data: seller } = await supabase
    .from("profiles")
    .select("id, username, created_at, followers_only_offers")
    .eq("id", listing.user_id)
    .single();

  // Seller's other active (non-held) public listings
  const { data: otherListings } = await supabase
    .from("collection_items")
    .select(`
      id, for_sale, for_trade, list_price, grader, grade, condition,
      cards ( name, set_name, image_url, game_data )
    `)
    .eq("user_id", listing.user_id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .eq("on_hold", false)
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(6);

  const sellerFollowersOnly = !!(seller as any)?.followers_only_offers;

  // Is the current user following the seller? (for follow-gate check)
  const [{ data: watchEntry }, { data: followEntry }] = await Promise.all([
    supabase.from("watchlist").select("id").eq("user_id", user.id).eq("item_id", id).maybeSingle(),
    sellerFollowersOnly && listing.user_id !== user.id
      ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", listing.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <ListingDetail
      listing={{
        id:          listing.id,
        user_id:     listing.user_id,
        condition:   listing.condition,
        finish:      (listing as any).finish,
        for_sale:    listing.for_sale,
        for_trade:   listing.for_trade,
        list_price:  listing.list_price,
        quantity:    listing.quantity,
        grader:      listing.grader,
        grade:       listing.grade,
        cert_number: (listing as any).cert_number,
        notes:       listing.notes,
        created_at:  listing.created_at,
        on_hold:     (listing as any).on_hold ?? false,
      }}
      card={{
        id:          card.id,
        game:        card.game,
        name:        card.name,
        set_name:    card.set_name,
        card_number: card.card_number,
        year:        card.year,
        image_url:   card.image_url,
        game_data:   card.game_data as Record<string, unknown> | null,
      }}
      seller={seller ?? { id: listing.user_id, username: "Unknown", created_at: listing.created_at }}
      otherListings={(otherListings ?? []).map((l) => ({
        id:         l.id,
        for_sale:   l.for_sale,
        for_trade:  l.for_trade,
        list_price: l.list_price,
        grader:     l.grader,
        grade:      l.grade,
        condition:  l.condition,
        card:       Array.isArray(l.cards) ? l.cards[0] : l.cards,
      }))}
      currentUserId={user.id}
      initialWatched={!!watchEntry}
      sellerFollowersOnly={sellerFollowersOnly}
      currentUserFollowsSeller={!!followEntry}
    />
  );
}
