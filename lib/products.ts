export const PRODUCT_TYPES = [
  { value: "etb",            label: "Elite Trainer Box (ETB)" },
  { value: "booster_box",    label: "Booster Box" },
  { value: "bundle",         label: "Bundle" },
  { value: "blister",        label: "Blister Pack" },
  { value: "single_pack",    label: "Single Booster Pack" },
  { value: "collection_box", label: "Collection Box" },
  { value: "other",          label: "Other" },
];

export const PRODUCT_TYPE_LABEL = Object.fromEntries(
  PRODUCT_TYPES.map(({ value, label }) => [value, label])
);

/**
 * Best-effort classification of a sealed-product name into one of PRODUCT_TYPES.
 * Used to pre-select the type when a product is picked from search. Order is
 * significant — the more specific phrase wins (e.g. "Elite Trainer Box" and
 * "Booster Box" both contain "box", so they're checked before generic boxes),
 * and "case" is matched first because a case of boxes has no dedicated type.
 * Returns "" when nothing matches confidently, so the user still picks manually.
 */
/**
 * Standard current-era Pokémon MSRP (USD) by product type, for the types that
 * have a stable consumer MSRP. Used to pre-fill "Cost Paid" as an editable
 * estimate when a product is picked from search. Types without a standard
 * consumer MSRP (booster_box, collection_box, other) are intentionally ABSENT
 * so the field is left blank rather than guessed. Revisit if TPCi resets MSRPs.
 */
export const PRODUCT_TYPE_MSRP: Record<string, number> = {
  etb:         49.99, // Elite Trainer Box
  bundle:      26.94, // Booster Bundle (6 packs)
  single_pack:  4.49, // Booster Pack
  blister:     14.99, // 3-pack blister
};

export function inferProductType(name: string): string {
  const n = name.toLowerCase();
  if (/\bcase\b/.test(n))                         return "other";        // box/ETB cases have no type
  if (/elite trainer box|\betb\b/.test(n))        return "etb";
  if (/booster box/.test(n))                      return "booster_box";  // incl. "half booster box"
  if (/bundle/.test(n))                           return "bundle";       // "booster bundle"
  if (/blister/.test(n))                          return "blister";
  if (/booster pack|single pack|\bpack\b/.test(n)) return "single_pack";
  if (/collection|premium|\bbox\b|\btin\b/.test(n)) return "collection_box";
  return "";
}
