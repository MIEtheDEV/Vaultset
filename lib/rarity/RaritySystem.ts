// Abstract base class for game-specific rarity systems.
// Each TCG has its own rarity hierarchy, variant names, and finish rules.
// Subclasses encapsulate that game-specific logic while exposing a
// consistent interface — callers never need to know which game they're
// working with.

export interface RarityVariantInfo {
  variantKey:   string;
  variantLabel: string;
  finishKey:    string;
  finishLabel:  string;
}

export interface RarityOption {
  value: string;
  label: string;
}

export interface RarityGroup {
  group:   string;
  options: RarityOption[];
}

export abstract class RaritySystem {
  /** The game identifier this system handles (e.g. "pokemon"). */
  abstract readonly game: string;

  /**
   * Returns variant and finish info for the given rarity key, or null
   * if the finish is user-selectable (e.g. Common / Uncommon / Rare).
   */
  abstract getVariantInfo(rarity: string): RarityVariantInfo | null;

  /**
   * Returns a sort weight for the rarity — lower = higher rarity.
   * Used to sort collections by rarity descending.
   */
  abstract getSortOrder(rarity: string): number;

  /** Returns the human-readable display label for a rarity key. */
  abstract getDisplayLabel(rarity: string): string;

  /** Returns grouped rarity options for form dropdowns. */
  abstract getRarityOptions(): RarityGroup[];

  /**
   * Convenience method — true when rarity fully determines finish,
   * so the finish field should be locked (not user-selectable).
   * Implemented here using getVariantInfo(), demonstrating that
   * subclasses only need to override the core methods.
   */
  isFinishLocked(rarity: string): boolean {
    return this.getVariantInfo(rarity) !== null;
  }
}
