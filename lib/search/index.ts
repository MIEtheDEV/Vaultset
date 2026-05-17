import { CardSearchProvider } from "./CardSearchProvider";
import { PokemonTCGProvider } from "./PokemonTCGProvider";

export { CardSearchProvider } from "./CardSearchProvider";
export type { SearchResult, SearchOptions } from "./CardSearchProvider";
export { PokemonTCGProvider } from "./PokemonTCGProvider";

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
