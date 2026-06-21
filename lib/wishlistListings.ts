/**
 * A single active marketplace listing of a wishlist card, returned by
 * `GET /api/wishlist/listings` and rendered in the wishlist card drawer.
 * Enriched per-requester: market_price drives "best value", and the follow
 * flags drive the Followers / Followed filters.
 */
export interface WishlistCardListing {
  listing_id: string;
  seller_id: string;
  seller_username: string;
  seller_avatar_url: string | null;
  seller_avatar_color: string | null;
  seller_is_pro: boolean;
  for_sale: boolean;
  for_trade: boolean;
  list_price: number | null;
  market_price: number | null;
  condition: string | null;
  finish: string | null;
  grader: string | null;
  grade: number | null;
  quantity: number;
  created_at: string;
  follows_me: boolean;       // this seller follows the requester
  followed_by_me: boolean;   // the requester follows this seller
}
