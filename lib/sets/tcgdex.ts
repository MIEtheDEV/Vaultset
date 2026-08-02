import { normalizeCardNumber } from "@/lib/search/cardNumber";

// Build-time backstop for `set_cards` where pokemontcg.io has gone thin. It
// covers two distinct failures, both first seen in the Mega Evolution era:
//
//  1. MISSING PRINTINGS. `deriveFinishes` derives a card's printings from the
//     KEYS of pokemontcg.io's `tcgplayer.prices`. From Ascended Heroes (me2pt5,
//     Jan 2026) onward pokemontcg.io returns cards with an empty `tcgplayer`
//     block, so every card fell through to the single-guessed-finish fallback
//     and NO card in those sets carried `reverse_holofoil` — Chaos Rising's
//     master set counted 122 instead of 198 (86 numbered + 36 secrets + 76
//     reverses). TCGdex still has the real TCGplayer printing keys, nested under
//     `variants_detailed[].pricing.tcgplayer`.
//
//  2. MISSING CARDS. pokemontcg.io can declare a set total it doesn't actually
//     serve: me2pt5 reports `total: 295` but its card list yields 255, with the
//     40-card secret-rare tail (#250–295) simply absent. That silently shortens
//     the Complete Set denominator. TCGdex lists all 295.
//
// Printing keys are translated into pokemontcg.io's spelling and fed to the SAME
// `deriveFinishes`, so there is exactly one derivation rule no matter which
// source supplied them.
//
// Deliberately NOT used at request time: it's one HTTP call per card, so it runs
// only from `pnpm sets:index` (scripts/build-set-cards.ts).
//
// Note: TCGdex's top-level `variants.reverse` boolean is NOT usable here — it is
// `false` for every Chaos Rising card even though the pricing block lists a
// `reverse-holofoil` product. The pricing keys are the reliable signal.

export const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

export interface TcgdexSetSummary {
  id: string;
  name: string;
}

export interface TcgdexCardDetail {
  variants_detailed?: {
    pricing?: { tcgplayer?: Record<string, unknown> | null } | null;
  }[] | null;
}

/** TCGdex spells TCGplayer's printings in kebab-case; pokemontcg.io uses camel. */
const KEY_MAP: Record<string, string> = {
  "normal": "normal",
  "holofoil": "holofoil",
  "reverse-holofoil": "reverseHolofoil",
  "1st-edition": "1stEditionNormal",
  "1st-edition-normal": "1stEditionNormal",
  "1st-edition-holofoil": "1stEditionHolofoil",
};

// Metadata that sits alongside the printing entries in the same object.
const NON_PRINTING_KEYS = new Set(["unit", "updated"]);

/**
 * The pokemontcg.io-style `tcgplayer.prices` keys a TCGdex card implies. A card
 * can list the same printing under several `variants_detailed` entries, so keys
 * are unioned across all of them.
 */
export function tcgdexPriceKeys(card: TcgdexCardDetail): string[] {
  const keys = new Set<string>();
  for (const variant of card.variants_detailed ?? []) {
    const tcgplayer = variant?.pricing?.tcgplayer;
    if (!tcgplayer) continue;
    for (const raw of Object.keys(tcgplayer)) {
      if (NON_PRINTING_KEYS.has(raw)) continue;
      // Pass unmapped keys through — `deriveFinishes` ignores what it doesn't
      // recognize, and swallowing them here would hide a new printing type.
      keys.add(KEY_MAP[raw] ?? raw);
    }
  }
  return [...keys];
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Fraction of the numbers we already hold that TCGdex also has. Everything the
 * caller does with TCGdex data is matched on the normalized collector number,
 * which is only meaningful if both catalogs number the set the same way — and
 * they don't always. TCGdex numbers Celebrations: Classic Collection CC001–CC025
 * while pokemontcg.io keeps each card's ORIGINAL set number (Base Set Charizard
 * is #4), so nothing matched and a naive gap-fill appended all 25 as "missing",
 * turning a 25-card set into 47. Below MIN_NUMBERING_ALIGNMENT, ignore TCGdex.
 *
 * Returns 0 for an empty `ours` — with nothing to check against there's no
 * evidence the numbering agrees, and guessing is what this guards against.
 */
export function numberingAlignment(theirs: Iterable<string>, ours: Set<string>): number {
  if (ours.size === 0) return 0;
  let overlap = 0;
  for (const n of theirs) if (ours.has(n)) overlap++;
  return overlap / ours.size;
}

export const MIN_NUMBERING_ALIGNMENT = 0.9;

/**
 * Resolve a pokemontcg.io set name to a TCGdex set id. The two use different
 * id schemes ("me4" vs "me04"), so match on the normalized name instead.
 */
export function findTcgdexSet(sets: TcgdexSetSummary[], setName: string): TcgdexSetSummary | undefined {
  const want = normName(setName);
  return sets.find((s) => normName(s.name) === want);
}

type FetchJson = (url: string) => Promise<unknown>;

/** Run `work` over `items` with at most `limit` in flight. */
async function forEachPooled<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        await work(items[i]);
      }
    }),
  );
}

// The set list is the same ~180KB response for every set we look up in a run.
let setListCache: Promise<TcgdexSetSummary[]> | null = null;

/** Test-only: drop the memoized set list so each case starts from a clean fetch. */
export function resetTcgdexSetCache(): void {
  setListCache = null;
}

/** The `/cards/<id>` payload, in the fields we read off it. */
type TcgdexFullCard = TcgdexCardDetail & { name?: string; rarity?: string; image?: string };

/** A TCGdex card reduced to the fields `set_cards` needs. */
export interface TcgdexCard {
  numberRaw: string;   // TCGdex localId, e.g. "250"
  name: string;
  rarity: string | null; // TCGdex's own wording, e.g. "Illustration rare"
  imageUrl: string | null;
  priceKeys: string[];   // pokemontcg.io-spelled; empty when TCGdex has no pricing
}

// TCGdex serves assets as `<base>/<quality>.<ext>`. "low" is ~245px wide, the
// same class as pokemontcg.io's `images.small`, which is what every other row's
// image_url holds and what the grid tiles render.
const imageUrlFor = (base: string | undefined) => (base ? `${base}/low.webp` : null);

/**
 * Every card TCGdex has for a set, keyed by normalized collector number.
 * Returns null when TCGdex doesn't carry the set at all, so the caller keeps
 * whatever it already has.
 *
 * `priceKeys` may be empty — that means "TCGdex has no pricing for this card",
 * NOT "this card has no printings". Callers must not overwrite a derived finish
 * list with an empty key set.
 */
export async function fetchTcgdexSetCards(
  setName: string,
  opts: { fetchJson: FetchJson; concurrency?: number; log?: (msg: string) => void },
): Promise<Map<string, TcgdexCard> | null> {
  const { fetchJson, concurrency = 6, log } = opts;

  setListCache ??= fetchJson(`${TCGDEX_BASE}/sets`).then((r) => (r ?? []) as TcgdexSetSummary[]);
  let sets: TcgdexSetSummary[];
  try {
    sets = await setListCache;
  } catch (e) {
    setListCache = null; // don't pin a transient failure for the rest of the run
    throw e;
  }
  const match = findTcgdexSet(sets, setName);
  if (!match) {
    log?.(`TCGdex has no set named "${setName}"`);
    return null;
  }

  const detail = (await fetchJson(`${TCGDEX_BASE}/sets/${encodeURIComponent(match.id)}`)) as {
    cards?: { id: string; localId: string; name?: string }[];
  };
  const listed = detail?.cards ?? [];
  if (listed.length === 0) {
    log?.(`TCGdex set ${match.id} listed no cards`);
    return null;
  }

  const byNumber = new Map<string, TcgdexCard>();
  await forEachPooled(listed, concurrency, async (card) => {
    const num = normalizeCardNumber(card.localId);
    if (!num) return;
    let full: TcgdexFullCard | null = null;
    try {
      full = (await fetchJson(`${TCGDEX_BASE}/cards/${encodeURIComponent(card.id)}`)) as TcgdexFullCard;
    } catch {
      return; // a single unreachable card shouldn't sink the set
    }
    if (!full) return;
    byNumber.set(num, {
      numberRaw: card.localId,
      name: full.name ?? card.name ?? "",
      rarity: full.rarity ?? null,
      imageUrl: imageUrlFor(full.image),
      priceKeys: tcgdexPriceKeys(full),
    });
  });

  const priced = [...byNumber.values()].filter((c) => c.priceKeys.length > 0).length;
  log?.(`TCGdex ${match.id}: ${byNumber.size}/${listed.length} cards read (${priced} with printings)`);
  return byNumber.size > 0 ? byNumber : null;
}
