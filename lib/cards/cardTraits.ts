// Card-trait derivation shared by the add form and the scan/search pipeline.
// Kept isomorphic (pure, no server/client deps) so both sides derive identically.

const EX_SUBTYPES = ["ex", "mega", "gx", "v", "vmax", "vstar", "v-union"];

/**
 * Whether a Pokémon card is an "ex"-class card (ex / EX / GX / V / VMAX / VSTAR /
 * V-UNION / Mega). Uses pokemontcg.io `subtypes` when present, and otherwise infers
 * from the card name's suffix — so the flag stays correct for scan matches that
 * arrive without subtypes (fromIndex / `tcg:` / enrichment timeouts), where it
 * would previously always come back false.
 */
export function deriveIsEx(name: string, subtypes?: string[]): boolean {
  const sub = subtypes?.map((s) => s.toLowerCase()) ?? [];
  if (sub.some((s) => EX_SUBTYPES.includes(s))) return true;
  // Name suffix, e.g. "Charizard ex", "M Rayquaza EX", "Pikachu GX", "Zacian V",
  // "Charizard VMAX", "Arceus VSTAR", "Mewtwo V-UNION".
  return /\s(?:ex|gx|v|vmax|vstar|v-union)$/i.test(name.trim());
}

/**
 * Whether a card is a promo. Promo is represented as `rarity === "promo"`; this
 * detects it from the matched card's set name or an already-mapped rarity key.
 */
export function isPromoCard(setName: string, mappedRarity?: string): boolean {
  return mappedRarity === "promo" || /promo/i.test(setName);
}
