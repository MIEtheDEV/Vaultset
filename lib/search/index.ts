import { CardSearchProvider, type SearchResult } from "./CardSearchProvider";
import { PokemonTCGProvider } from "./PokemonTCGProvider";
import { getJustTcgById } from "./justTcgSearch";

export { CardSearchProvider } from "./CardSearchProvider";
export type { SearchResult, SearchOptions } from "./CardSearchProvider";
export { PokemonTCGProvider, fetchPokemonCardDetail } from "./PokemonTCGProvider";
export type { PokemonCardDetail } from "./PokemonTCGProvider";

// Registry of providers keyed by game identifier.
// Adding a new game means adding one entry here — callers stay unchanged.
const registry: Record<string, CardSearchProvider> = {
  pokemon: new PokemonTCGProvider(),
};

/**
 * Returns the CardSearchProvider for the given game.
 * Demonstrates polymorphism: the caller works with the abstract base class
 * regardless of which concrete provider is returned.
 */
export function getSearchProvider(game: string): CardSearchProvider {
  return registry[game] ?? registry.pokemon;
}

/**
 * Resolve a single card's catalog metadata from our price-cache key, routing by
 * id form: pokemontcg.io native ids → the game provider, `tcg:<id>` → JustTCG.
 * Manual (`manual:`) cards have no external catalog source. Used by the card-data
 * page to render a card that isn't in our DB yet.
 */
export async function resolveCardById(apiId: string, game = "pokemon"): Promise<SearchResult | null> {
  if (apiId.startsWith("manual:")) return null;
  if (apiId.startsWith("tcg:")) return getJustTcgById(apiId.slice(4));
  return getSearchProvider(game).getById(apiId);
}
