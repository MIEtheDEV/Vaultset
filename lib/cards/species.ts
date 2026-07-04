// Group cards by their base Pokémon species for /pokemon/[name] hubs.
// "Charizard ex" / "Charizard VMAX" / "M Charizard EX" → "Charizard".

const SUFFIX = /\s+\b(ex|gx|v|vmax|vstar|v-?union|break|prime|star|lv\.?\s?x)\b\.?$/i;

/** Human-readable species name (for hub titles). */
export function speciesName(cardName: string): string {
  let n = (cardName ?? "").split(/\s*&\s*/)[0].trim();        // "Mewtwo & Mew GX" → "Mewtwo"
  n = n.replace(/\s*[-–—]?\s*\d+[a-z]?\/\d+\s*$/i, "").trim(); // "Crobat - 093/086" → "Crobat"
  n = n.replace(/^m\s+/i, "");                                // "M Charizard EX" → "Charizard EX"
  n = n.replace(SUFFIX, "").trim();                           // strip trailing mechanic suffix
  return n.trim();
}

/** URL slug for a species, e.g. "charizard". */
export function speciesSlug(cardName: string): string {
  return speciesName(cardName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
