import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ListingDetail } from "@/components/ListingDetail";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the listing — must be a public listing
  const { data: listing } = await supabase
    .from("collection_items")
    .select(`
      id, user_id, condition, finish, for_sale, for_trade,
      list_price, quantity, grader, grade, cert_number, notes, created_at,
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

  // Seller profile
  const { data: seller } = await supabase
    .from("profiles")
    .select("id, username, created_at")
    .eq("id", listing.user_id)
    .single();

  // Seller's other public listings
  const { data: otherListings } = await supabase
    .from("collection_items")
    .select(`
      id, for_sale, for_trade, list_price, grader, grade, condition,
      cards ( name, set_name, image_url, game_data )
    `)
    .eq("user_id", listing.user_id)
    .or("for_sale.eq.true,for_trade.eq.true")
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(6);

  // Is the current user watching this listing?
  const { data: watchEntry } = await supabase
    .from("watchlist")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_id", id)
    .maybeSingle();

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
    />
  );
}
