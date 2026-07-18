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

// ── Rarity symbols ────────────────────────────────────────────────────────────
// The visual mark stamped on a card next to its rarity name. We store only the
// *shape* and *color family* here (pure data) — the actual SVG rendering lives in
// components/RaritySymbol.tsx so this stays usable server-side and game-agnostic.
export type RaritySymbolShape =
  | "circle"       // Common
  | "diamond"      // Uncommon
  | "star"         // single star
  | "double_star"  // two stars
  | "triple_star"  // three stars (Hyper Rare)
  | "starburst"    // 4-pointed burst (Mega Hyper Rare)
  | "ace_badge";   // stylized ACE SPEC text block

// "black" renders as currentColor so it stays legible in light and dark themes.
// The metallic/two-tone colors render as gradients in the component.
export type RaritySymbolColor =
  | "black"
  | "gold"
  | "silver"
  | "magenta"
  | "two_tone"  // pastel pink + pastel green (Mega Attack Rare)
  | "rainbow";  // legacy Rare Rainbow card treatment

export interface RaritySymbolInfo {
  shape: RaritySymbolShape;
  color: RaritySymbolColor;
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

  /**
   * Returns the symbol (shape + color) for a rarity key, or null if the key
   * is unknown / has no symbol. Callers pair this with getDisplayLabel to
   * render the mark next to the title.
   */
  abstract getSymbol(rarity: string): RaritySymbolInfo | null;

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
