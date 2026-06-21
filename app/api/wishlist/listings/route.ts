import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { WishlistCardListing } from "@/lib/wishlistListings";

/**
 * Active marketplace listings for a single card, used by the wishlist card
 * drawer. Returns every for-sale/for-trade, non-held listing of the card
 * (matched by pokemon_api_id, the same cross-user key the wishlist uses),
 * excluding the requester's own listings, enriched with the listing's stored
 * market_price (for "best value") and the requester's follow relationship with
 * each seller (for the Followers / Followed filters).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiId = new URL(request.url).searchParams.get("apiId");
  if (!apiId) return NextResponse.json({ error: "apiId required" }, { status: 400 });

  // Cards sharing this pokemon_api_id (each collector adds their own cards row).
  const { data: cards } = await supabase
    .from("cards")
    .select("id")
    .contains("game_data", { pokemon_api_id: apiId });

  const cardIds = (cards ?? []).map((c) => c.id);
  if (cardIds.length === 0) return NextResponse.json({ listings: [] });

  // Active listings of those cards by everyone except the requester.
  const { data: rows } = await supabase
    .from("collection_items")
    .select("id, user_id, condition, finish, for_sale, for_trade, list_price, market_price, grader, grade, quantity, created_at")
    .in("card_id", cardIds)
    .or("for_sale.eq.true,for_trade.eq.true")
    .eq("on_hold", false)
    .neq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return NextResponse.json({ listings: [] });

  const sellerIds = [...new Set(rows.map((r) => r.user_id as string))];

  const [{ data: profiles }, { data: iFollow }, { data: followMe }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, avatar_color, is_pro, pro_plan, pro_expires_at, banned")
      .in("id", sellerIds),
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .in("following_id", sellerIds),
    supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", user.id)
      .in("follower_id", sellerIds),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const followedByMe = new Set((iFollow ?? []).map((f) => f.following_id as string));
  const followsMe = new Set((followMe ?? []).map((f) => f.follower_id as string));

  const listings: WishlistCardListing[] = rows
    .map((r) => {
      const p = profileMap.get(r.user_id as string);
      if (!p || p.banned) return null; // hide banned sellers, mirroring marketplace
      return {
        listing_id: r.id as string,
        seller_id: r.user_id as string,
        seller_username: p.username as string,
        seller_avatar_url: (p.avatar_url as string | null) ?? null,
        seller_avatar_color: (p.avatar_color as string | null) ?? null,
        seller_is_pro: Boolean(p.is_pro),
        for_sale: Boolean(r.for_sale),
        for_trade: Boolean(r.for_trade),
        list_price: r.list_price as number | null,
        market_price: r.market_price as number | null,
        condition: r.condition as string | null,
        finish: r.finish as string | null,
        grader: r.grader as string | null,
        grade: r.grade as number | null,
        quantity: (r.quantity as number) ?? 1,
        created_at: r.created_at as string,
        follows_me: followsMe.has(r.user_id as string),
        followed_by_me: followedByMe.has(r.user_id as string),
      };
    })
    .filter((x): x is WishlistCardListing => x !== null);

  return NextResponse.json({ listings });
}
