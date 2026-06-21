import { PriceProvider } from "./PriceProvider";
import { JustTcgPriceProvider } from "./JustTcgPriceProvider";
import { TcgGoPriceProvider } from "./TcgGoPriceProvider";
import { PokeWalletPriceProvider } from "./PokeWalletPriceProvider";
import { PokemonTcgPriceProvider } from "./PokemonTcgPriceProvider";

export { PriceProvider, PriceProviderError } from "./PriceProvider";
export type { CardRef, PricePayload, PricingSource, FetchContext } from "./PriceProvider";

// Tier order: fastest/freshest first, bedrock last. Mirrors lib/search/index.ts.
// Bedrock (pokemontcg.io) is always configured, so the chain never ends empty.
const TIERS: PriceProvider[] = [
  new JustTcgPriceProvider(),    // Tier 1 — real-time batch (needs JUSTTCG_API_KEY)
  new TcgGoPriceProvider(),      // Tier 2 — scaffold (needs TCGGO_RAPID_API_KEY)
  new PokeWalletPriceProvider(), // Tier 3 — scaffold (needs POKEWALLET_API_KEY)
  new PokemonTcgPriceProvider(), // Tier 4 — bedrock, always available
];

/**
 * Returns the ordered list of providers that are currently configured. Callers
 * cascade through them in order. Unconfigured tiers (no API key) are omitted.
 */
export function getPriceProviders(): PriceProvider[] {
  return TIERS.filter((p) => p.isConfigured());
}
