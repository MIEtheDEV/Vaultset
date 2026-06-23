/**
 * Normalize a collector number for comparison across sources/formats.
 * Drops the "/total" suffix, casefolds, and strips leading zeros so that
 * "67", "067", and "67/191" all compare equal; "TG12" → "tg12".
 *
 * Shared by the catalog search (pokemontcg.io + JustTCG merge/ranking) and the
 * JustTCG price matcher so number comparison never drifts between them.
 */
export function normalizeCardNumber(s: string | null | undefined): string {
  return (s ?? "").split("/")[0].trim().toLowerCase().replace(/^0+(?=\w)/, "");
}
