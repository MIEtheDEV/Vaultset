import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import { headlineMarketValue } from "@/lib/pricing/headlineMarketValue";
import { speciesSlug } from "@/lib/cards/species";
import { byCardNumberThenId, byReleaseDesc } from "./hubOrder";

// Programmatic-hub data layer. A single daily-cached "catalog" snapshot (distinct
// catalog cards + their market value) backs every hub; each hub just filters/
// groups it in-memory, so there's no per-hub N+1. If this grows past what a
// fetch-all can serve, swap the snapshot for a materialized view (same shape).

export interface CatalogCard {
  apiId: string;
  name: string;
  setCode: string | null;
  setName: string;
  number: string | null;
  image: string | null;
  rarity: string | null;
  value: number | null;
  /** ISO YYYY-MM-DD from `set_cards.release_date`; null for catalog-only cards. */
  releaseDate: string | null;
}

// Shared with the master-set view so both derive the same headline figure.
const marketValue = headlineMarketValue;

// PostgREST clamps every response to the project's max-rows (~1000 here) — even
// with a high .limit() or a wide .range() — so any fetch-all must page through in
// chunks ≤ that cap. Pass a query factory that applies .range(from,to); we walk
// pages until one comes back short. Requires a stable .order() on a unique column
// so pages don't overlap or skip.
export async function paginate<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await makeQuery(from, from + PAGE - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function buildCatalog(): Promise<CatalogCard[]> {
  const admin = createAdminClient();
  const [cards, prices, { data: releaseDates }] = await Promise.all([
    paginate((f, t) => admin.from("cards").select("id, name, set_name, set_code, card_number, image_url, game_data").order("id").range(f, t)),
    paginate((f, t) => admin.from("card_prices").select("card_api_id, prices").order("card_api_id").range(f, t)),
    admin.rpc("set_release_dates"),
  ]);
  const priceMap = new Map(prices.map((p) => [p.card_api_id as string, p.prices]));
  // `cards` has no release date of its own; inherit the set's. Cards whose
  // set_code isn't a pokemontcg.io set id (JustTCG-sourced promos) stay null and
  // sort into the tail.
  const releaseMap = (releaseDates ?? {}) as Record<string, string>;
  const seen = new Map<string, CatalogCard>();
  for (const c of cards) {
    const gd = (c.game_data ?? {}) as Record<string, unknown>;
    const apiId = priceApiId(gd, c.id as string);
    if (!apiId || apiId.startsWith("manual:") || seen.has(apiId)) continue;
    seen.set(apiId, {
      apiId,
      name: c.name as string,
      setCode: (c.set_code as string) ?? null,
      setName: (c.set_name as string) ?? "",
      number: (c.card_number as string) ?? null,
      image: (c.image_url as string) ?? null,
      rarity: (gd.rarity as string) ?? null,
      value: marketValue(priceMap.get(apiId)),
      releaseDate: releaseMap[c.set_code as string] ?? null,
    });
  }
  return [...seen.values()];
}

/** Distinct catalog cards with market value — daily-cached; the base for all hubs. */
// Bump the key suffix when the catalog shape / normalization logic changes so a
// deploy busts the persisted data cache instead of waiting out the TTL.
export const getCatalog = unstable_cache(buildCatalog, ["seo-catalog", "v3"], {
  revalidate: 86400,
  tags: ["seo-catalog"],
});

const byValueDesc = (a: CatalogCard, b: CatalogCard) => (b.value ?? -1) - (a.value ?? -1);

// ── Set hubs: sourced from the complete `set_cards` checklist (not the catalog) ──
// The catalog above only holds cards users have added/searched, so it undercounts
// sets and omits ones nobody has touched. The set hubs read `set_cards` (the full
// pokemontcg.io-built checklist) instead.
//
// Deliberately NOT a single fetch-all snapshot like getCatalog: set_cards is ~18k
// rows (~4MB), which exceeds both PostgREST's single-response row cap AND Next's
// 2MB unstable_cache entry limit. So the index uses a server-side aggregate (RPC,
// 156 rows) and each set page does a bounded per-set query (≤255 rows). Both are
// cap-safe; the per-set reads are tiny, indexed, build-time only (pages are ISR),
// and never hit the DB on user requests.

export interface SetSummary { setCode: string; setName: string; count: number }

async function buildSetHubIndex(): Promise<SetSummary[]> {
  const admin = createAdminClient();
  // One grouped row per set_code (server-side count) — small + cap-safe.
  const { data } = await admin.rpc("set_completion_totals");
  return ((data ?? []) as { set_code: string; set_name: string; complete_total: number }[]).map((r) => ({
    setCode: r.set_code,
    setName: r.set_name,
    count: Number(r.complete_total),
  }));
}

/** Every set with its full card count — daily-cached. Backs the /sets index. */
export const getSetHubIndex = unstable_cache(buildSetHubIndex, ["seo-set-hub", "v1"], {
  revalidate: 86400,
  tags: ["seo-set-hub"],
});

// Ordering lives in ./hubOrder (pure, unit-tested). Re-exported for callers.
export { byCardNumber, byCardNumberThenId, byReleaseDesc } from "./hubOrder";

/** The full card checklist for a set (with market value where we have it), by number. */
export async function getSetChecklist(setCode: string): Promise<CatalogCard[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("set_cards")
    .select("pokemon_api_id, name, set_code, set_name, card_number, image_url, rarity, release_date")
    .eq("set_code", setCode);
  // Only cards with a native pokemontcg.io id can link to a /card-data page.
  const cards = (rows ?? []).filter((r) => r.pokemon_api_id);
  const apiIds = cards.map((r) => r.pokemon_api_id as string);
  const { data: prices } = apiIds.length
    ? await admin.from("card_prices").select("card_api_id, prices").in("card_api_id", apiIds)
    : { data: [] as { card_api_id: string; prices: unknown }[] };
  const priceMap = new Map((prices ?? []).map((p) => [p.card_api_id as string, p.prices]));
  return cards
    .map((r) => ({
      apiId: r.pokemon_api_id as string,
      name: r.name as string,
      setCode: (r.set_code as string) ?? null,
      setName: (r.set_name as string) ?? "",
      number: (r.card_number as string) ?? null,
      image: (r.image_url as string) ?? null,
      rarity: (r.rarity as string) ?? null,
      value: marketValue(priceMap.get(r.pokemon_api_id as string)),
      releaseDate: (r.release_date as string) ?? null,
    }))
    // A single set is already one release date — number order is the natural
    // read here. Tiebreak on apiId so the order is reproducible either way.
    .sort(byCardNumberThenId);
}

export async function getRarityCards(rarityKey: string): Promise<CatalogCard[]> {
  return (await getCatalog()).filter((c) => c.rarity === rarityKey).sort(byReleaseDesc);
}

// ── Species hubs: sourced from `set_cards`, same reasoning as the set hubs ──
// These used to filter getCatalog(), which only holds cards users have added or
// searched — so "All Empoleon Cards" rendered the 1 Empoleon anyone owned, not
// the 22 that exist. We instead resolve slug → the real card names in the full
// checklist, then do a bounded per-species read (largest species is ~123 rows).
//
// The slug→name map can't be built in SQL: speciesName()'s normalization (the
// "Mewtwo & Mew GX" / "M Charizard EX" / trailing-mechanic rules) lives in TS
// and must stay the single source of truth. So we pull just the distinct names
// (a ~100KB aggregate, cap-safe via the RPC) and group them here.

export interface SpeciesSummary { slug: string; names: string[]; count: number }

async function buildSpeciesIndex(): Promise<SpeciesSummary[]> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("set_card_name_counts");
  const rows = (data ?? []) as { name: string; n: number }[];
  const bySlug = new Map<string, SpeciesSummary>();
  for (const r of rows) {
    const slug = speciesSlug(r.name);
    if (!slug) continue;
    const e = bySlug.get(slug) ?? { slug, names: [], count: 0 };
    e.names.push(r.name);
    e.count += r.n;
    bySlug.set(slug, e);
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count);
}

/** slug → the checklist card names that roll up to it — daily-cached. */
export const getSpeciesIndex = unstable_cache(buildSpeciesIndex, ["seo-species", "v2"], {
  revalidate: 86400,
  tags: ["seo-species"],
});

export async function getSpeciesCards(slug: string): Promise<CatalogCard[]> {
  const entry = (await getSpeciesIndex()).find((s) => s.slug === slug);

  let checklist: CatalogCard[] = [];
  if (entry?.names.length) {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("set_cards")
      .select("pokemon_api_id, name, set_code, set_name, card_number, image_url, rarity, release_date")
      .in("name", entry.names)
      .not("pokemon_api_id", "is", null)
      // byReleaseDesc below is authoritative; ordering the fetch too just makes
      // the intermediate state reproducible when debugging.
      .order("release_date", { ascending: false })
      .order("pokemon_api_id");
    const apiIds = (rows ?? []).map((r) => r.pokemon_api_id as string);
    const { data: prices } = apiIds.length
      ? await admin.from("card_prices").select("card_api_id, prices").in("card_api_id", apiIds)
      : { data: [] as { card_api_id: string; prices: unknown }[] };
    const priceMap = new Map((prices ?? []).map((p) => [p.card_api_id as string, p.prices]));
    checklist = (rows ?? []).map((r) => ({
      apiId: r.pokemon_api_id as string,
      name: r.name as string,
      setCode: (r.set_code as string) ?? null,
      setName: (r.set_name as string) ?? "",
      number: (r.card_number as string) ?? null,
      image: (r.image_url as string) ?? null,
      rarity: (r.rarity as string) ?? null,
      value: marketValue(priceMap.get(r.pokemon_api_id as string)),
      releaseDate: (r.release_date as string) ?? null,
    }));
  }

  // Union in the catalog so JustTCG-sourced promos (`tcg:` ids, absent from the
  // pokemontcg.io-built checklist) don't disappear from hubs that already rank.
  const merged = new Map(checklist.map((c) => [c.apiId, c]));
  for (const c of await getCatalog()) {
    if (speciesSlug(c.name) === slug && !merged.has(c.apiId)) merged.set(c.apiId, c);
  }
  return [...merged.values()].sort(byReleaseDesc);
}

export async function getMostValuable(limit = 100): Promise<CatalogCard[]> {
  return (await getCatalog()).filter((c) => c.value != null).sort(byValueDesc).slice(0, limit);
}

/** Set codes with a full checklist — for /sets/[setCode] static params + sitemap. */
export async function distinctSetCardCodes(): Promise<string[]> {
  return (await getSetHubIndex()).map((s) => s.setCode);
}
export async function distinctRarities(): Promise<string[]> {
  return [...new Set((await getCatalog()).map((c) => c.rarity).filter((r): r is string => !!r))];
}
/** Every species slug (checklist ∪ catalog) — for the sitemap. */
export async function distinctSpecies(): Promise<string[]> {
  const [index, catalog] = await Promise.all([getSpeciesIndex(), getCatalog()]);
  return [...new Set([
    ...index.map((s) => s.slug),
    ...catalog.map((c) => speciesSlug(c.name)),
  ].filter(Boolean))];
}

/** The busiest species, for build-time prerender. The other ~3k render on first
 *  request via ISR (`dynamicParams`) — prerendering all of them would add
 *  thousands of DB round-trips to every build for pages nobody has hit yet. */
export async function topSpecies(limit = 250): Promise<string[]> {
  return (await getSpeciesIndex()).slice(0, limit).map((s) => s.slug);
}

// ── Marketplace category hubs: distinct cards currently listed for sale/trade ──

export interface ListedCard extends CatalogCard {
  forSale: number;
  forTrade: number;
  lowestAsk: number | null;
}

async function buildListedCatalog(): Promise<ListedCard[]> {
  const admin = createAdminClient();
  const items = await paginate((f, t) =>
    admin
      .from("collection_items")
      .select("id, card_id, for_sale, for_trade, list_price, user_id")
      .or("for_sale.eq.true,for_trade.eq.true")
      .eq("on_hold", false)
      .order("id")
      .range(f, t),
  );
  if (!items.length) return [];

  const cardIds = [...new Set(items.map((i) => i.card_id as string))];
  const sellerIds = [...new Set(items.map((i) => i.user_id as string))];
  const [{ data: cards }, { data: sellers }, { data: releaseDates }] = await Promise.all([
    admin.from("cards").select("id, name, set_name, set_code, card_number, image_url, game_data").in("id", cardIds),
    admin.from("profiles").select("id, banned").in("id", sellerIds),
    admin.rpc("set_release_dates"),
  ]);
  const banned = new Set((sellers ?? []).filter((s) => s.banned).map((s) => s.id as string));
  const releaseMap = (releaseDates ?? {}) as Record<string, string>;

  const meta = new Map<string, CatalogCard>();
  for (const c of cards ?? []) {
    const gd = (c.game_data ?? {}) as Record<string, unknown>;
    const apiId = priceApiId(gd, c.id as string);
    if (!apiId || apiId.startsWith("manual:")) continue;
    meta.set(c.id as string, {
      apiId,
      name: c.name as string,
      setCode: (c.set_code as string) ?? null,
      setName: (c.set_name as string) ?? "",
      number: (c.card_number as string) ?? null,
      image: (c.image_url as string) ?? null,
      rarity: (gd.rarity as string) ?? null,
      value: null,
      releaseDate: releaseMap[c.set_code as string] ?? null,
    });
  }
  const apiIds = [...new Set([...meta.values()].map((m) => m.apiId))];
  const { data: prices } = apiIds.length
    ? await admin.from("card_prices").select("card_api_id, prices").in("card_api_id", apiIds)
    : { data: [] as { card_api_id: string; prices: unknown }[] };
  const priceMap = new Map((prices ?? []).map((p) => [p.card_api_id as string, p.prices]));

  const agg = new Map<string, ListedCard>();
  for (const it of items) {
    if (banned.has(it.user_id as string)) continue;
    const m = meta.get(it.card_id as string);
    if (!m) continue;
    const e = agg.get(m.apiId) ?? { ...m, value: marketValue(priceMap.get(m.apiId)), forSale: 0, forTrade: 0, lowestAsk: null };
    if (it.for_sale) {
      e.forSale++;
      const lp = it.list_price as number | null;
      if (lp != null) e.lowestAsk = e.lowestAsk == null ? lp : Math.min(e.lowestAsk, lp);
    }
    if (it.for_trade) e.forTrade++;
    agg.set(m.apiId, e);
  }
  return [...agg.values()];
}

/** Distinct cards with active listings — hourly-cached (listings churn faster). */
export const getListedCatalog = unstable_cache(buildListedCatalog, ["seo-listed", "v3"], {
  revalidate: 3600,
  tags: ["seo-listed"],
});

// Most-listed first, then value — but both tie often (most cards have a single
// listing), so fall through to the total order rather than leaving it to the DB.
const byListing = (a: ListedCard, b: ListedCard) =>
  (b.forSale + b.forTrade) - (a.forSale + a.forTrade)
  || (b.value ?? -1) - (a.value ?? -1)
  || byReleaseDesc(a, b);

export async function getListedBySet(setCode: string): Promise<ListedCard[]> {
  return (await getListedCatalog()).filter((c) => c.setCode === setCode).sort(byListing);
}
export async function getListedBySpecies(slug: string): Promise<ListedCard[]> {
  return (await getListedCatalog()).filter((c) => speciesSlug(c.name) === slug).sort(byListing);
}
export async function distinctListedSetCodes(): Promise<string[]> {
  return [...new Set((await getListedCatalog()).map((c) => c.setCode).filter((s): s is string => !!s))];
}
export async function distinctListedSpecies(): Promise<string[]> {
  return [...new Set((await getListedCatalog()).map((c) => speciesSlug(c.name)).filter(Boolean))];
}
