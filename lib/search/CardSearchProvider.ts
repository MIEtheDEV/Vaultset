// Abstract base class for card search providers.
// Each supported game (Pokémon, MTG, etc.) implements this interface,
// allowing the rest of the application to treat all providers uniformly
// — the concrete game logic stays encapsulated inside each subclass.

export interface TcgPlayerPricePoint {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  directLow: number | null;
}

export interface TcgPlayerData {
  url: string;
  updatedAt: string;
  prices: Record<string, TcgPlayerPricePoint>;
}

export interface SearchResult {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  subtypes?: string[];
  set: { id: string; name: string };
  images: { small: string; large: string };
  tcgplayer?: TcgPlayerData | null;
}

export interface SearchOptions {
  set?: string;
  number?: string;
  promoRequested?: boolean;
}

export abstract class CardSearchProvider {
  /** The game identifier this provider handles (e.g. "pokemon"). */
  abstract readonly game: string;

  /** Fetch search results for a card name query. */
  abstract search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Map a raw API rarity string (e.g. "Double Rare") to the internal
   * rarity key used throughout the application (e.g. "double_rare").
   */
  abstract mapRarity(apiRarity: string): string;
}
