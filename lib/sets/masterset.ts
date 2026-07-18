import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPokemonSets } from "@/lib/sets/getPokemonSets";
import { normalizeCardNumber } from "@/lib/search/cardNumber";
import { sortFinishes } from "@/lib/sets/setCardFinishes";

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
  const { data } = await supabase
    .from("collection_items")
    .select("finish, cards!inner(set_code, set_name, card_number)")
    .eq("user_id", userId);

  const bySet = new Map<string, OwnedNumbers>();
  const touchedCodes = new Set<string>();

  for (const row of (data ?? []) as unknown as {
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

  const ownedNumbers = ownedIndex.bySet.get(setCode);
  const cards: CardStatus[] = setRows.map((r) => {
    const ownedFinishes = resolveOwnedFinishes(r.finishes, ownedNumbers?.get(r.card_number));
    return {
      ...r,
      ownedFinishes,
      ownedComplete: (ownedNumbers?.get(r.card_number)?.size ?? 0) > 0,
      ownedMaster: r.finishes.length > 0 && ownedFinishes.length >= r.finishes.length,
    };
  });

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
    const { data: rows } = await supabase
      .from("set_cards")
      .select("set_code, card_number, finishes")
      .in("set_code", touched);
    for (const r of (rows ?? []) as { set_code: string; card_number: string; finishes: string[] }[]) {
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
    if (ownedNumbers && cardFinishes) {
      for (const [num, finishes] of cardFinishes) {
        const owned = ownedNumbers.get(num);
        if (!owned || owned.size === 0) continue;
        completeOwned += 1;
        masterOwned += resolveOwnedFinishes(finishes, owned).length;
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
      master: { owned: masterOwned, total: t.master_total },
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
