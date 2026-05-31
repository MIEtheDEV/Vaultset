export interface WishlistMatch {
  listing_id: string;
  seller_id: string;
  seller_username: string;
  for_sale: boolean;
  for_trade: boolean;
  list_price: number | null;
  condition: string | null;
  grader: string | null;
  grade: number | null;
  card_name: string;
  set_name: string;
  card_number: string | null;
  image_url: string | null;
  game_data: Record<string, unknown> | null;
}

export function dedupeMatches(raw: WishlistMatch[]): WishlistMatch[] {
  return Array.from(new Map(raw.map((m) => [m.listing_id, m])).values());
}
