// Pure ordering logic for the programmatic hub grids. Kept out of hubQueries so
// it carries no `server-only` / Supabase import and can be unit-tested directly.

/** The structural subset of CatalogCard the comparators actually read. */
export interface OrderableCard {
  apiId: string;
  setCode: string | null;
  number: string | null;
  releaseDate: string | null;
}

// Natural collector-number order: numeric cards ascending, then non-numeric
// (TG/GG/SV promos) lexically after them.
export const byCardNumber = (a: OrderableCard, b: OrderableCard) => {
  const na = parseInt(a.number ?? "", 10), nb = parseInt(b.number ?? "", 10);
  const aNum = !Number.isNaN(na), bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb || (a.number ?? "").localeCompare(b.number ?? "");
  if (aNum) return -1;
  if (bNum) return 1;
  return (a.number ?? "").localeCompare(b.number ?? "");
};

/** Number order within a single set, made reproducible by the apiId tiebreak. */
export const byCardNumberThenId = (a: OrderableCard, b: OrderableCard) =>
  byCardNumber(a, b) || a.apiId.localeCompare(b.apiId);

// Cross-set hub ordering: newest set first, then natural card order within it.
//
// This is a TOTAL order — it can never return 0 for two distinct cards, because
// it bottoms out on the unique apiId. That property is the point. The previous
// comparator sorted on market value alone, and only ~3% of checklist cards have
// a price row, so nearly every pair tied; V8's stable sort then fell through to
// PostgREST's row order, which has no ORDER BY and is planner-dependent. The
// result got frozen into a 24h ISR page and could reshuffle on each revalidate
// — including the ItemList JSON-LD positions we publish to Google.
//
// Value is deliberately NOT the primary key here. At current coverage, "priced
// first" ranks by which cards we happen to have warmed, not by worth: it would
// put a $1.56 Empoleon ex above the Diamond & Pearl Empoleon LV.X simply because
// we hold a price row for one. Desirability is surfaced by the rarity-ranked
// ChaseCards strip instead, which is well-defined for every checklist card.
export const byReleaseDesc = (a: OrderableCard, b: OrderableCard) => {
  // Nulls last: catalog-only cards (JustTCG promos) have no set release date.
  if (a.releaseDate !== b.releaseDate) {
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return b.releaseDate.localeCompare(a.releaseDate);
  }
  // Same-day releases (e.g. swsh11 / swsh11tg) — keep each set's cards together.
  const set = (a.setCode ?? "").localeCompare(b.setCode ?? "");
  if (set !== 0) return set;
  return byCardNumberThenId(a, b);
};
