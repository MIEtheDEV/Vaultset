/**
 * Collector-number ordering — the order a set appears in a binder.
 *
 * `set_cards.card_number` is the *normalized* number (`normalizeCardNumber`:
 * "/total" dropped, casefolded, leading zeros stripped), so it's text and a plain
 * text sort reads 1, 10, 100, 101, … 11, 110. That is what the master-set grid
 * was doing.
 *
 * Numeric collation fixes it and handles every shape present in the catalog:
 *
 *   pure digits          17184 rows   1 < 2 < 10 < 100
 *   alpha prefix+digits   1390 rows   tg2 < tg12;  and 250 < tg1, so the
 *                                     Trainer/Galarian/SV gallery subsets land
 *                                     after the main run rather than interleaved
 *   digits+alpha suffix     71 rows   28 < 28a < 29
 *   pure alpha              30 rows   the ex10 Unown a–z run, after the numbers
 *   other                   10 rows   ex10's "!" and "?" Unown
 *
 * A module-level `Intl.Collator` is reused rather than calling
 * `String.localeCompare` per comparison — constructing a collator per call is the
 * expensive part, and a fixed "en" locale keeps the order identical for every
 * user regardless of their browser locale.
 */
const collator = new Intl.Collator("en", { numeric: true });

export function compareCardNumbers(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return collator.compare(a ?? "", b ?? "");
}
