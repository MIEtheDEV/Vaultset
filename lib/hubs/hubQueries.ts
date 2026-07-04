import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import { speciesSlug } from "@/lib/cards/species";

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
}

function marketValue(prices: unknown): number | null {
  if (!prices || typeof prices !== "object") return null;
  const p = prices as Record<string, { market?: number | null } | null>;
  return (
    p.holofoil?.market ??
    p.normal?.market ??
    p.reverseHolofoil?.market ??
    Object.values(p).map((x) => x?.market).find((m) => m != null) ??
    null
  );
}

async function buildCatalog(): Promise<CatalogCard[]> {
  const admin = createAdminClient();
  const [{ data: cards }, { data: prices }] = await Promise.all([
    admin.from("cards").select("id, name, set_name, set_code, card_number, image_url, game_data").limit(20000),
    admin.from("card_prices").select("card_api_id, prices").limit(20000),
  ]);
  const priceMap = new Map((prices ?? []).map((p) => [p.card_api_id as string, p.prices]));
  const seen = new Map<string, CatalogCard>();
  for (const c of cards ?? []) {
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
    });
  }
  return [...seen.values()];
}

/** Distinct catalog cards with market value — daily-cached; the base for all hubs. */
// Bump the key suffix when the catalog shape / normalization logic changes so a
// deploy busts the persisted data cache instead of waiting out the TTL.
export const getCatalog = unstable_cache(buildCatalog, ["seo-catalog", "v2"], {
  revalidate: 86400,
  tags: ["seo-catalog"],
});

const byValueDesc = (a: CatalogCard, b: CatalogCard) => (b.value ?? -1) - (a.value ?? -1);

export interface SetSummary { setCode: string; setName: string; count: number; sample: string | null; topValue: number }

export async function getSetsIndex(): Promise<SetSummary[]> {
  const cat = await getCatalog();
  const bySet = new Map<string, SetSummary>();
  for (const c of cat) {
    if (!c.setCode) continue;
    const e = bySet.get(c.setCode) ?? { setCode: c.setCode, setName: c.setName, count: 0, sample: null, topValue: 0 };
    e.count++;
    if (!e.sample && c.image) e.sample = c.image;
    if ((c.value ?? 0) > e.topValue) e.topValue = c.value ?? 0;
    bySet.set(c.setCode, e);
  }
  return [...bySet.values()].sort((a, b) => b.count - a.count);
}

export async function getSetCards(setCode: string): Promise<CatalogCard[]> {
  return (await getCatalog()).filter((c) => c.setCode === setCode).sort(byValueDesc);
}

export async function getRarityCards(rarityKey: string): Promise<CatalogCard[]> {
  return (await getCatalog()).filter((c) => c.rarity === rarityKey).sort(byValueDesc);
}

export async function getSpeciesCards(slug: string): Promise<CatalogCard[]> {
  return (await getCatalog()).filter((c) => speciesSlug(c.name) === slug).sort(byValueDesc);
}

export async function getMostValuable(limit = 100): Promise<CatalogCard[]> {
  return (await getCatalog()).filter((c) => c.value != null).sort(byValueDesc).slice(0, limit);
}

export async function distinctSetCodes(): Promise<string[]> {
  return [...new Set((await getCatalog()).map((c) => c.setCode).filter((s): s is string => !!s))];
}
export async function distinctRarities(): Promise<string[]> {
  return [...new Set((await getCatalog()).map((c) => c.rarity).filter((r): r is string => !!r))];
}
export async function distinctSpecies(): Promise<string[]> {
  return [...new Set((await getCatalog()).map((c) => speciesSlug(c.name)).filter(Boolean))];
}

// ── Marketplace category hubs: distinct cards currently listed for sale/trade ──

export interface ListedCard extends CatalogCard {
  forSale: number;
  forTrade: number;
  lowestAsk: number | null;
}

async function buildListedCatalog(): Promise<ListedCard[]> {
  const admin = createAdminClient();
  const { data: items } = await admin
    .from("collection_items")
    .select("card_id, for_sale, for_trade, list_price, user_id")
    .or("for_sale.eq.true,for_trade.eq.true")
    .eq("on_hold", false)
    .limit(20000);
  if (!items?.length) return [];

  const cardIds = [...new Set(items.map((i) => i.card_id as string))];
  const sellerIds = [...new Set(items.map((i) => i.user_id as string))];
  const [{ data: cards }, { data: sellers }] = await Promise.all([
    admin.from("cards").select("id, name, set_name, set_code, card_number, image_url, game_data").in("id", cardIds),
    admin.from("profiles").select("id, banned").in("id", sellerIds),
  ]);
  const banned = new Set((sellers ?? []).filter((s) => s.banned).map((s) => s.id as string));

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
export const getListedCatalog = unstable_cache(buildListedCatalog, ["seo-listed", "v2"], {
  revalidate: 3600,
  tags: ["seo-listed"],
});

const byListing = (a: ListedCard, b: ListedCard) =>
  (b.forSale + b.forTrade) - (a.forSale + a.forTrade) || (b.value ?? -1) - (a.value ?? -1);

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
