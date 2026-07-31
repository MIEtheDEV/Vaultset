import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPokemonSets } from "@/lib/sets/getPokemonSets";
import { normalizeCardNumber } from "@/lib/search/cardNumber";
import { sortFinishes, FINISH_ORDER } from "@/lib/sets/setCardFinishes";
import { compareCardNumbers } from "@/lib/sets/cardNumberSort";
import { selectChaseCards as rankChaseCards } from "@/lib/sets/chaseCards";
import { headlineMarketValue } from "@/lib/pricing/headlineMarketValue";

// Master-set completion: cross-reference the shared `set_cards` checklist against
// a user's owned `collection_items`. Two tiers:
//   • Complete Set — one copy of each card number (denominator = card count)
//   • Master Set   — every finish of every card (denominator = Σ finishes)
//
// Ownership is matched on the NORMALIZED collector number within a set (resilient:
// our `cards` catalog isn't deduped and `pokemon_api_id` may be absent). A card's
// set is resolved by `set_code`, falling back to a set-name→code map for older
// rows whose `set_code` was never populated (see docs/docs.md deferred note).

export interface SetCardRow {
  card_number: string;
  name: string;
  rarity: string | null;
  image_url: string | null;
  finishes: string[];
  pokemon_api_id: string | null;
  variant_fidelity: string;
}

export interface CardStatus extends SetCardRow {
  ownedFinishes: string[]; // subset of `finishes` the user owns
  ownedComplete: boolean;  // owns at least one copy (any finish)
  ownedMaster: boolean;    // owns every finish
  /** Headline market value, when cached. Ranks the chase strip; null = unpriced. */
  value: number | null;
}

export interface Progress { owned: number; total: number }

export interface MasterSetView {
  setCode: string;
  setName: string;
  logo?: string;
  series?: string;
  releaseDate?: string;
  printedTotal?: number; // pokemontcg.io numbered base count (excludes secret rares)
  cards: CardStatus[];
  chaseCards: CardStatus[]; // the set's rarest cards ("hits"), rarest-first
  complete: Progress;
  master: Progress;
  hasPartial: boolean;   // any card's finish list may be incomplete (SV-era / no price data)
  rarities: string[];    // distinct rarity keys present, for the filter
}

export interface SetSummary {
  setCode: string;
  setName: string;
  logo?: string;
  series?: string;
  releaseYear?: string;
  releaseDate?: string; // full YYYY/MM/DD, for precise newest-first sorting
  printedTotal?: number;
  complete: Progress;
  master: Progress;
  hasPartial: boolean;
}

// number → set of owned finishes ("" = a copy with no recorded finish)
type OwnedNumbers = Map<string, Set<string>>;

interface OwnedIndex {
  bySet: Map<string, OwnedNumbers>;
  touchedCodes: Set<string>;
}

const normName = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// Chase-card selection is shared with the public set hub (lib/sets/chaseCards) so
// the two strips for the same set can't disagree — they previously used different
// tiebreaks. Ranking is value-first where the set is priced, rarity otherwise.
const selectChaseCards = (cards: CardStatus[]): CardStatus[] =>
  rankChaseCards(cards, (c) => ({
    rarity: c.rarity,
    value: c.value,
    number: c.card_number,
    key: c.pokemon_api_id ?? c.card_number,
  }));

// PostgREST caps every response at 1,000 rows and gives NO signal that it
// truncated — a short array is indistinguishable from "that's all of them". Both
// reads below blow past that in normal use (13 touched sets = 2,172 catalog rows;
// a serious collector's inventory is thousands of lots), and the truncation was
// silent in the worst way: a set whose rows fell past the cutoff came back with
// NOTHING, so `getSetCompletionSummaries` scored it 0 and the index rendered
// "no progress" for sets the user demonstrably owns. Always page these.
const PAGE_SIZE = 1000;

/** Read every row of a range-able query, one PAGE_SIZE window at a time. The
 *  caller MUST apply a stable .order() — unordered paging can repeat or skip rows. */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await page(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

// JustTCG prefixes set names like "SV07: Stellar Crown" / "ME03: Perfect Order" /
// "ME: Ascended Heroes"; pokemontcg.io uses the bare name. Strip a leading
// "<code>: " so the name→code fallback still resolves these.
const stripSetPrefix = (s: string) => s.replace(/^[a-z0-9]{1,6}:\s*/i, "");

/** Build a normalized set-name → set_code map from the pokemontcg.io catalog. */
async function nameToCodeMap(): Promise<Map<string, string>> {
  const sets = await getPokemonSets();
  const map = new Map<string, string>();
  for (const s of sets.values()) map.set(normName(s.name), s.id);
  return map;
}

/**
 * Resolve a card's set to a pokemontcg.io set_code: prefer the stored set_code,
 * else map by set name (trying the raw name and a JustTCG-prefix-stripped variant).
 */
function resolveSetCode(
  setCode: string | null | undefined,
  setName: string | null | undefined,
  nameToCode: Map<string, string>,
): string | undefined {
  if (setCode) return setCode;
  if (!setName) return undefined;
  return nameToCode.get(normName(setName)) ?? nameToCode.get(normName(stripSetPrefix(setName)));
}

/**
 * Load every owned lot for a user, bucketed by resolved set_code → card number →
 * owned finishes. One query for the whole collection (bounded by the user's own
 * inventory), reused by both the index and the per-set view.
 */
export async function loadOwnedIndex(
  supabase: SupabaseClient,
  userId: string,
): Promise<OwnedIndex> {
  const nameToCode = await nameToCodeMap();
  const data = await fetchAllRows((from, to) =>
    supabase
      .from("collection_items")
      .select("finish, cards!inner(set_code, set_name, card_number)")
      .eq("user_id", userId)
      .order("id")
      .range(from, to),
  );

  const bySet = new Map<string, OwnedNumbers>();
  const touchedCodes = new Set<string>();

  for (const row of data as unknown as {
    finish: string | null;
    cards: { set_code: string | null; set_name: string | null; card_number: string | null };
  }[]) {
    const card = row.cards;
    if (!card) continue;
    const code = resolveSetCode(card.set_code, card.set_name, nameToCode);
    if (!code) continue;
    const num = normalizeCardNumber(card.card_number ?? "");
    if (!num) continue;

    let numbers = bySet.get(code);
    if (!numbers) { numbers = new Map(); bySet.set(code, numbers); }
    let finishes = numbers.get(num);
    if (!finishes) { finishes = new Set(); numbers.set(num, finishes); }
    finishes.add(row.finish ?? "");
    touchedCodes.add(code);
  }

  return { bySet, touchedCodes };
}

/**
 * Resolve which of a card's finishes a user owns. A copy with no recorded finish
 * ("") counts toward the first not-yet-owned slot so legacy rows still register.
 */
function resolveOwnedFinishes(cardFinishes: string[], owned: Set<string> | undefined): string[] {
  if (!owned || owned.size === 0) return [];
  const captured = new Set(cardFinishes.filter((f) => owned.has(f)));
  if (owned.has("")) {
    const firstOpen = cardFinishes.find((f) => !captured.has(f));
    if (firstOpen) captured.add(firstOpen);
  }
  return sortFinishes([...captured]);
}

/**
 * A card's effective finish list plus the subset owned. The catalog's list is
 * derived from TCGplayer price keys and is explicitly best-effort — SV/ME-era and
 * not-yet-priced sets are flagged `partial` and can under-report printings (a
 * brand-new set with no price data collapses to a single guessed finish). A finish
 * the user actually holds is physical evidence that printing exists, so it joins
 * BOTH sides of the ratio: without this, owning the holo *and* the reverse holo of
 * a card the catalog only knows as non-holo scored 0/1 instead of 2/2. Widening
 * the denominator too is what keeps completion honest (never >100%).
 */
function resolveCardFinishes(
  cardFinishes: string[],
  owned: Set<string> | undefined,
): { finishes: string[]; ownedFinishes: string[] } {
  const extra = [...(owned ?? [])].filter(
    (f) => FINISH_ORDER.includes(f) && !cardFinishes.includes(f),
  );
  const finishes = extra.length ? sortFinishes([...cardFinishes, ...extra]) : cardFinishes;
  return { finishes, ownedFinishes: resolveOwnedFinishes(finishes, owned) };
}

/** Full per-set view: every card with ownership overlay + both progress tiers. */
export async function getMasterSetView(
  supabase: SupabaseClient,
  setCode: string,
  ownedIndex: OwnedIndex,
): Promise<MasterSetView | null> {
  const [{ data: rows }, meta] = await Promise.all([
    supabase
      .from("set_cards")
      .select("card_number, card_number_raw, name, rarity, image_url, finishes, pokemon_api_id, variant_fidelity")
      .eq("set_code", setCode)
      .order("card_number"),
    getPokemonSets().then((m) => m.get(setCode)),
  ]);

  const setRows = (rows ?? []) as (SetCardRow & { card_number_raw: string | null })[];
  if (setRows.length === 0) return null;

  // Cached prices for this set — one bounded read (≤255 ids), no upstream fetch.
  // Only used to rank the chase strip; a miss just means rarity ordering.
  const apiIds = setRows.map((r) => r.pokemon_api_id).filter((id): id is string => !!id);
  const { data: priceRows } = apiIds.length
    ? await supabase.from("card_prices").select("card_api_id, prices").in("card_api_id", apiIds)
    : { data: [] as { card_api_id: string; prices: unknown }[] };
  const priceMap = new Map((priceRows ?? []).map((p) => [p.card_api_id as string, p.prices]));

  const ownedNumbers = ownedIndex.bySet.get(setCode);
  // `.order("card_number")` above is a TEXT sort on the normalized number, which
  // reads 1, 10, 100, … 11, 110. Re-sort numerically so the grid's default is
  // binder order; the client can re-sort from there. (Doing it here rather than in
  // SQL keeps the DB order deterministic for the query itself and costs nothing —
  // the largest set is 304 cards.)
  const cards: CardStatus[] = setRows.map((r) => {
    const owned = ownedNumbers?.get(r.card_number);
    const { finishes, ownedFinishes } = resolveCardFinishes(r.finishes, owned);
    return {
      ...r,
      finishes, // widened by any printing the user's own copies prove exists
      ownedFinishes,
      ownedComplete: (owned?.size ?? 0) > 0,
      ownedMaster: finishes.length > 0 && ownedFinishes.length >= finishes.length,
      value: r.pokemon_api_id ? headlineMarketValue(priceMap.get(r.pokemon_api_id)) : null,
    };
  }).sort((a, b) => compareCardNumbers(a.card_number, b.card_number));

  const complete: Progress = {
    owned: cards.filter((c) => c.ownedComplete).length,
    total: cards.length,
  };
  const master: Progress = {
    owned: cards.reduce((n, c) => n + c.ownedFinishes.length, 0),
    total: cards.reduce((n, c) => n + c.finishes.length, 0),
  };

  const rarities = [...new Set(cards.map((c) => c.rarity).filter((r): r is string => !!r))];

  return {
    setCode,
    setName: meta?.name ?? setRows[0].name ?? setCode,
    logo: meta?.images?.logo,
    series: meta?.series,
    releaseDate: meta?.releaseDate,
    printedTotal: meta?.printedTotal,
    cards,
    chaseCards: selectChaseCards(cards),
    complete,
    master,
    hasPartial: cards.some((c) => c.variant_fidelity === "partial"),
    rarities,
  };
}

// Pro-only signal for a single marketplace listing: does this card advance the
// viewer's set/master-set completion? Powers the marketplace "Needed for your
// set" / "Completes your set" callouts.
export interface ListingSetSignal {
  setCode: string;
  setName: string;
  needed: boolean;        // viewer doesn't own this card number at all
  neededFinish: boolean;  // viewer owns the card but not this listing's finish
  listingFinish: string | null;
  completesComplete: boolean; // this card is the viewer's last missing number
  complete: Progress;
  master: Progress;
}

export async function getListingSetSignal(
  supabase: SupabaseClient,
  userId: string,
  card: { set_code?: string | null; set_name?: string | null; card_number?: string | null },
  listingFinish: string | null,
): Promise<ListingSetSignal | null> {
  const nameToCode = await nameToCodeMap();
  const setCode = resolveSetCode(card.set_code, card.set_name, nameToCode);
  if (!setCode) return null;
  const num = normalizeCardNumber(card.card_number ?? "");
  if (!num) return null;

  const ownedIndex = await loadOwnedIndex(supabase, userId);
  const view = await getMasterSetView(supabase, setCode, ownedIndex);
  if (!view) return null;
  const status = view.cards.find((c) => c.card_number === num);
  if (!status) return null;

  const needed = !status.ownedComplete;
  const neededFinish =
    status.ownedComplete &&
    !!listingFinish &&
    status.finishes.includes(listingFinish) &&
    !status.ownedFinishes.includes(listingFinish);

  return {
    setCode,
    setName: view.setName,
    needed,
    neededFinish,
    listingFinish,
    completesComplete: needed && view.complete.total > 0 && view.complete.owned === view.complete.total - 1,
    complete: view.complete,
    master: view.master,
  };
}

/**
 * Per-set completion summaries for the index. Set-level totals come from one
 * grouped read of `set_cards`; owned counts are computed from the user's owned
 * index, fetching finish lists only for the sets the user has actually touched.
 */
export async function getSetCompletionSummaries(
  supabase: SupabaseClient,
  userId: string,
): Promise<SetSummary[]> {
  const [ownedIndex, meta, { data: totalsRaw }] = await Promise.all([
    loadOwnedIndex(supabase, userId),
    getPokemonSets(),
    supabase.rpc("set_completion_totals"),
  ]);

  const totals = (totalsRaw ?? []) as {
    set_code: string; set_name: string; complete_total: number; master_total: number; has_partial: boolean;
  }[];

  // For touched sets, pull the finish lists to compute owned card × finish counts.
  const touched = [...ownedIndex.touchedCodes];
  const finishesBySet = new Map<string, Map<string, string[]>>();
  if (touched.length > 0) {
    const rows = await fetchAllRows<{ set_code: string; card_number: string; finishes: string[] }>(
      (from, to) =>
        supabase
          .from("set_cards")
          .select("set_code, card_number, finishes")
          .in("set_code", touched)
          .order("set_code")
          .order("card_number")
          .range(from, to),
    );
    for (const r of rows) {
      let m = finishesBySet.get(r.set_code);
      if (!m) { m = new Map(); finishesBySet.set(r.set_code, m); }
      m.set(r.card_number, r.finishes);
    }
  }

  const summaries: SetSummary[] = totals.map((t) => {
    const ownedNumbers = ownedIndex.bySet.get(t.set_code);
    const cardFinishes = finishesBySet.get(t.set_code);
    let completeOwned = 0;
    let masterOwned = 0;
    // Extra denominator slots for printings the catalog missed but the user owns —
    // mirrors the per-set view so the index and the set page agree (see
    // resolveCardFinishes). The RPC's master_total can't know about these.
    let masterExtra = 0;
    if (ownedNumbers && cardFinishes) {
      for (const [num, finishes] of cardFinishes) {
        const owned = ownedNumbers.get(num);
        if (!owned || owned.size === 0) continue;
        completeOwned += 1;
        const eff = resolveCardFinishes(finishes, owned);
        masterOwned += eff.ownedFinishes.length;
        masterExtra += eff.finishes.length - finishes.length;
      }
    }
    const m = meta.get(t.set_code);
    return {
      setCode: t.set_code,
      setName: m?.name ?? t.set_name,
      logo: m?.images?.logo,
      series: m?.series,
      releaseYear: m?.releaseDate?.slice(0, 4),
      releaseDate: m?.releaseDate,
      printedTotal: m?.printedTotal,
      complete: { owned: completeOwned, total: t.complete_total },
      master: { owned: masterOwned, total: t.master_total + masterExtra },
      hasPartial: t.has_partial,
    };
  });

  // Owned sets first (by completion %), then the rest by newest release.
  const pct = (p: Progress) => (p.total > 0 ? p.owned / p.total : 0);
  return summaries.sort((a, b) => {
    const ap = pct(a.complete), bp = pct(b.complete);
    if ((ap > 0) !== (bp > 0)) return bp - ap > 0 ? 1 : -1;
    if (ap !== bp) return bp - ap;
    return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
  });
}
