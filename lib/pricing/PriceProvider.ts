// Abstract base for card price providers.
//
// Mirrors the polymorphic pattern used by lib/search: an abstract base + one
// concrete class per upstream source + a factory in index.ts. The orchestration
// engine (PriceFetchEngine) talks only to this interface, so adding a source is
// "implement the class, register it in index.ts".
//
// All providers produce prices in the SAME shape as pokemontcg.io's
// `tcgplayer.prices` (TcgPlayerData["prices"]), so PokemonTCGProvider.getMarketPrice()
// resolves finish/edition and applies condition/grade multipliers identically
// regardless of which source the numbers came from.

import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

export type PricingSource = "justtcg" | "tcggo" | "pokewallet" | "pokemon_tcg";

/** Identity + descriptor for a card to be priced. */
export interface CardRef {
  /** pokemontcg.io id, e.g. "sv4-1". Primary key into card_prices. */
  apiId: string;
  game?: string;
  name?: string;
  setName?: string;
  setCode?: string;
  number?: string;
  /** TCGplayer product id, once resolved (cached on card_prices.tcgplayer_id). */
  tcgplayerId?: string | null;
}

/** What a provider returns for a single card. */
export interface PricePayload {
  prices: TcgPlayerData["prices"];
  tcgplayerUrl?: string | null;
  /** Newly resolved TCGplayer product id; the engine persists it for reuse. */
  tcgplayerId?: string | null;
  /** Real per-condition prices ({ finish: { condition: price } }), when the
   *  source provides them (JustTCG). Absent for bedrock. */
  conditionPrices?: Record<string, Record<string, number>> | null;
}

/**
 * Context passed to fetchBatch. `recordRequest` MUST be awaited before each unit
 * of upstream quota is consumed; it returns false once the provider's daily cap
 * is reached, at which point the implementation should stop and throw
 * PriceProviderError(429) so the engine cascades to the next tier.
 */
export interface FetchContext {
  recordRequest: () => Promise<boolean>;
  /** When true, providers may spend extra quota resolving unmapped cards
   *  (e.g. JustTCG GET lookups). Used by the single-card on-demand path. */
  allowResolve: boolean;
}

/** Carries the upstream HTTP status so the engine's circuit breaker can act. */
export class PriceProviderError extends Error {
  constructor(public readonly status: number, message?: string) {
    super(message ?? `Price provider error ${status}`);
    this.name = "PriceProviderError";
  }
}

export abstract class PriceProvider {
  abstract readonly source: PricingSource;
  /** Max cards per upstream request. */
  abstract readonly batchSize: number;
  /** Daily request cap for the free tier; null = effectively unlimited. */
  abstract readonly dailyRequestCap: number | null;

  /** False when the source isn't usable (e.g. missing API key) → skipped. */
  abstract isConfigured(): boolean;

  /**
   * Price up to `batchSize` cards. Returns a map keyed by card apiId. Cards
   * absent from the map are "not found here" and cascade to the next provider.
   * Throws PriceProviderError(429|401|403) on rate-limit / quota / auth failure
   * to make the engine stop using this provider and cascade the chunk.
   */
  abstract fetchBatch(cards: CardRef[], ctx: FetchContext): Promise<Map<string, PricePayload>>;
}
