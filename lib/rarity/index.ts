import { RaritySystem } from "./RaritySystem";
import { PokemonRaritySystem } from "./PokemonRaritySystem";

export { RaritySystem } from "./RaritySystem";
export type {
  RarityVariantInfo,
  RarityOption,
  RarityGroup,
  RaritySymbolInfo,
  RaritySymbolShape,
  RaritySymbolColor,
} from "./RaritySystem";
export { PokemonRaritySystem } from "./PokemonRaritySystem";

// Registry of rarity systems keyed by game identifier.
const registry: Record<string, RaritySystem> = {
  pokemon: new PokemonRaritySystem(),
};

/**
 * Returns the RaritySystem for the given game.
 * Polymorphism in action: callers operate on the abstract RaritySystem
 * interface without knowing or caring which game's rules are applied.
 */
export function getRaritySystem(game: string): RaritySystem {
  return registry[game] ?? registry.pokemon;
}
