// Pure fact derivation for the programmatic hub prose. Kept out of hubQueries so
// it carries no `server-only` / Supabase import and can be unit-tested directly
// (same reasoning as ./hubOrder).
//
// Why this exists: Google determines a page's language from its *visible text*
// and ignores the `lang` attribute entirely. The hub pages were ~60 words of
// English wrapped around a grid of a hundred-plus Pokémon names, card numbers,
// and dollar figures — enough for Google's classifier to tag them non-English
// and surface "Translate this page" on every result. These helpers feed a real
// intro + FAQ so each hub reads as English prose to a classifier.
//
// Everything here is per-page factual (counts, dates, the set's top card), so the
// generated prose differs page to page rather than being one boilerplate block
// stamped across ~150 set hubs and ~3k species hubs.

/** The structural subset of CatalogCard the fact helpers actually read. */
export interface FactCard {
  name: string;
  setName: string;
  number: string | null;
  value: number | null;
  releaseDate: string | null;
}

// Deliberately a hardcoded English table rather than Intl.DateTimeFormat: the
// whole point of this module is text that reads as English regardless of where
// the page is rendered.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** pokemontcg.io emits `YYYY/MM/DD`; `set_cards.release_date` is ISO `YYYY-MM-DD`. */
export function parseReleaseDate(raw: string | null | undefined): { year: number; month: number } | null {
  if (!raw) return null;
  const m = /^(\d{4})[-/](\d{2})/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** "2003/09/18" → "September 2003". Null when the date is missing or malformed. */
export function formatReleaseMonth(raw: string | null | undefined): string | null {
  const d = parseReleaseDate(raw);
  return d ? `${MONTHS[d.month - 1]} ${d.year}` : null;
}

export function releaseYear(raw: string | null | undefined): number | null {
  return parseReleaseDate(raw)?.year ?? null;
}

/** The priced card with the highest market value, or null if nothing is priced. */
export function mostValuable<T extends FactCard>(cards: readonly T[]): T | null {
  let best: T | null = null;
  for (const c of cards) {
    if (c.value == null) continue;
    if (!best || c.value > (best.value ?? -1)) best = c;
  }
  return best;
}

/** Years spanned + distinct sets — the shape the species hubs describe. */
export function speciesSpan(cards: readonly FactCard[]): {
  firstYear: number | null;
  lastYear: number | null;
  setCount: number;
} {
  const years: number[] = [];
  const sets = new Set<string>();
  for (const c of cards) {
    const y = releaseYear(c.releaseDate);
    if (y != null) years.push(y);
    if (c.setName) sets.add(c.setName);
  }
  return {
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    setCount: sets.size,
  };
}

/** Match the `$0.00` shape the card tiles already render. */
export function formatUsd(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}

/** "Charizard #4" — the card plus its collector number, when we have one. */
export function cardLabel(card: FactCard): string {
  return card.number ? `${card.name} (#${card.number})` : card.name;
}

/** `["a", "b", "c"]` → `"a, b, and c"`. */
export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
