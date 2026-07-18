import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { CardValueChart } from "@/components/CardValueChart";
import { DailyChange } from "@/components/DailyChange";
import { readGradedPrices } from "@/lib/pricing/gradedPrices";
import { extractApiCardHistory, extractApiCardStats, extractApiVariants } from "@/lib/pricing/cardHistory";
import { mergeDailySeries, apiDailyChange, type PricePoint } from "@/lib/priceHistory";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";
import { RarityLabel } from "@/components/RaritySymbol";
import { speciesName, speciesSlug } from "@/lib/cards/species";
import { resolveCardById, getSearchProvider, fetchPokemonCardDetail, type SearchResult, type PokemonCardDetail } from "@/lib/search";
import { PriceFetchEngine } from "@/lib/pricing/PriceFetchEngine";
import { propagateMarketValues } from "@/lib/pricing/propagateMarketValues";
import type { CardRef } from "@/lib/pricing/PriceProvider";

const raritySystem = new PokemonRaritySystem();

// Route params arrive percent-encoded: a `tcg:`/`manual:` id linked as `tcg%3A676102`
// reaches us verbatim, so `startsWith("tcg:")` misses and the card 404s. Decode once
// at the entry points. (No-op for plain ids like `sv4pt5-234`.)
function decodeCardId(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// Card metadata (artist, attacks, set info) is immutable per card, but the fetch is
// an external pokemontcg.io round-trip that otherwise runs on every render — including
// every anonymous/crawler view. Cache it hard (24h) so crawls don't pay the network hop.
// Per-id keyParts + tag keep entries distinct and individually revalidatable later.
const cachedCardDetail = (cardId: string) =>
  unstable_cache(
    () => fetchPokemonCardDetail(cardId),
    ["card-detail", cardId],
    { revalidate: 86400, tags: [`card-detail:${cardId}`] },
  )();

const FINISH_LABEL: Record<string, string> = {
  normal: "Normal", holofoil: "Holofoil", reverseHolofoil: "Reverse Holo",
  "1stEditionNormal": "1st Ed. Normal", "1stEditionHolofoil": "1st Ed. Holo",
};
const COND_LABEL: Record<string, string> = {
  near_mint: "NM", lightly_played: "LP", moderately_played: "MP", heavily_played: "HP", damaged: "DMG",
};
const COND_ORDER = ["near_mint", "lightly_played", "moderately_played", "heavily_played", "damaged"];
const VARIANT_LABEL: Record<string, string> = {
  standard_ex: "Standard ex", full_art: "Full Art", illustration_rare: "Illustration Rare",
  special_illustration_rare: "Special Illustration Rare", gold_card: "Gold Card", secret_rare: "Secret Rare",
  standard_holo: "Standard Holo", standard_v: "Standard V", vmax: "VMAX", vstar: "VSTAR",
  rainbow_rare: "Rainbow Rare", shiny_rare: "Shiny Rare", shiny_gx: "Shiny GX", ace_spec: "ACE SPEC",
};

const money = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);
const eur = (n: number | null | undefined) => (n == null ? "—" : `€${Number(n).toFixed(2)}`);

type CardView = {
  id: string; game: string; name: string; set_name: string; set_code: string | null;
  card_number: string | null; year: number | null; image_url: string | null;
  game_data: Record<string, unknown>;
};

function normalizeCard(row: any): CardView {
  return {
    id: row.id, game: row.game ?? "pokemon", name: row.name, set_name: row.set_name,
    set_code: row.set_code ?? null, card_number: row.card_number ?? null, year: row.year ?? null,
    image_url: row.image_url ?? null, game_data: (row.game_data ?? {}) as Record<string, unknown>,
  };
}

// Adapt a live catalog SearchResult (card not in our DB yet) to the page's shape.
function fromSearchResult(sr: SearchResult, id: string): CardView {
  return {
    id, game: "pokemon", name: sr.name, set_name: sr.set?.name ?? "", set_code: sr.set?.id || null,
    card_number: sr.number || null, year: null, image_url: sr.images?.large ?? sr.images?.small ?? null,
    game_data: {
      ...(id.startsWith("tcg:") ? { tcgplayer_id: id.slice(4) } : { pokemon_api_id: id }),
      ...(sr.rarity ? { rarity: getSearchProvider("pokemon").mapRarity(sr.rarity) } : {}),
    },
  };
}

// Resolve a representative `cards` row (and all sibling rows) for a catalog price key.
async function resolveCards(admin: ReturnType<typeof createAdminClient>, key: string) {
  let q = admin
    .from("cards")
    .select("id, game, name, set_name, set_code, card_number, year, image_url, game_data");
  if (key.startsWith("tcg:")) q = q.eq("game_data->>tcgplayer_id", key.slice(4));
  else if (key.startsWith("manual:")) q = q.eq("id", key.slice(7));
  else q = q.eq("game_data->>pokemon_api_id", key);
  const { data } = await q.limit(50);
  const rows = data ?? [];
  const representative = rows.find((r) => r.image_url) ?? rows[0] ?? null;
  return { representative, ids: rows.map((r) => r.id) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = decodeCardId(rawId);
  const admin = createAdminClient();

  // Mirror the page body's resolution: prefer a `cards` row, else fall back to the
  // live catalog. Without this fallback, any card not yet in our DB — but present in
  // the price cache, so it's in the sitemap — rendered full content while emitting
  // `noindex` + no canonical, a self-inflicted deindex of a large share of card pages.
  const { representative } = await resolveCards(admin, id);
  let meta: { name: string; number: string | null; setName: string; image: string | null } | null =
    representative
      ? { name: representative.name, number: representative.card_number ?? null, setName: representative.set_name ?? "", image: representative.image_url ?? null }
      : null;
  if (!meta) {
    const sr = await resolveCardById(id);
    if (sr) meta = { name: sr.name, number: sr.number ?? null, setName: sr.set?.name ?? "", image: sr.images?.large ?? sr.images?.small ?? null };
  }
  if (!meta) return { title: "Card Not Found", robots: { index: false } };

  const numStr = meta.number ? ` #${meta.number}` : "";
  const title = `${meta.name}${numStr}${meta.setName ? ` — ${meta.setName}` : ""}`;
  const description = `Market value, price history, condition & graded prices, and marketplace availability for ${meta.name} (${meta.setName}${numStr}) on Vaultset.`;
  return {
    title,
    description,
    alternates: { canonical: `/card-data/${encodeURIComponent(id)}` },
    openGraph: {
      title: `${title} — Vaultset`,
      description,
      images: meta.image ? [{ url: meta.image, alt: meta.name }] : [],
    },
  };
}

export default async function CardDataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeCardId(rawId);
  const admin = createAdminClient();

  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();

  // Resolve from our own rows, or — for a card nobody has added yet — straight
  // from the catalog source, so any searched card has a page.
  const { representative: cardRow, ids: cardIds } = await resolveCards(admin, id);
  let card: CardView | null = cardRow ? normalizeCard(cardRow) : null;
  // For a card resolved live from the catalog (no cached price row), the resolve
  // response already carries a market price + TCGplayer url — keep them as a
  // display fallback so anonymous/crawler views aren't blank. No extra API call.
  let resolvedSr: SearchResult | null = null;
  if (!card) {
    resolvedSr = await resolveCardById(id);
    if (resolvedSr) card = fromSearchResult(resolvedSr, id);
  }
  if (!card) notFound();

  const gd = card.game_data;
  const finish = (gd.finish as string) ?? null;

  // Shared price cache + graded slabs.
  const [priceInit, graded] = await Promise.all([
    admin.from("card_prices").select("prices, condition_prices, tcgplayer_url, source, updated_at, raw").eq("card_api_id", id).maybeSingle(),
    readGradedPrices(admin, id),
  ]);
  let priceRow = priceInit.data as any;

  // Lazy warm: for signed-in viewers, price the card on demand when the cache is
  // missing or stale (>6h). The engine's budget caps + 6h freshness mean a browse
  // never overspends; anonymous/crawler views read whatever cache exists.
  const STALE_MS = 6 * 60 * 60 * 1000;
  const priceStale = !priceRow || Date.now() - new Date(priceRow.updated_at).getTime() > STALE_MS;
  if (user && priceStale) {
    try {
      const engine = new PriceFetchEngine(admin);
      const ref: CardRef = {
        apiId: id, game: card.game ?? "pokemon", name: card.name,
        setName: card.set_name, setCode: card.set_code ?? undefined, number: card.card_number ?? undefined,
      };
      const priced = await engine.getPrices([ref], { allowResolve: true });
      const resolved = priced.get(id);
      if (resolved && !resolved.fromCache) await propagateMarketValues(admin, [id]);
      if (resolved) {
        const reread = await admin.from("card_prices").select("prices, condition_prices, tcgplayer_url, source, updated_at, raw").eq("card_api_id", id).maybeSingle();
        priceRow = reread.data as any;
      }
    } catch { /* pricing is best-effort — fall back to whatever cache exists */ }
  }

  const raw = priceRow?.raw ?? null;
  const stats = extractApiCardStats(raw, { finish, condition: "near_mint" });
  const historyPoints = extractApiCardHistory(raw, { finish, condition: "near_mint" })?.points ?? [];

  const pricesObj = ((priceRow as any)?.prices ?? {}) as Record<string, { market?: number | null }>;
  const marketFromPrices =
    pricesObj.holofoil?.market ?? pricesObj.normal?.market ??
    Object.values(pricesObj).map((p) => p?.market).find((m) => m != null) ?? null;
  // Fallback to the just-resolved catalog price when nothing is cached yet.
  const srPrices = (resolvedSr?.tcgplayer?.prices ?? {}) as Record<string, { market?: number | null }>;
  const fallbackMarket =
    srPrices.holofoil?.market ?? srPrices.normal?.market ?? srPrices.reverseHolofoil?.market ??
    Object.values(srPrices).map((p) => p?.market).find((m) => m != null) ?? null;
  const current = stats?.current ?? marketFromPrices ?? fallbackMarket ?? null;

  const valueHistory: PricePoint[] = mergeDailySeries(historyPoints, [], current);
  const change24h = apiDailyChange(stats?.change24hrPct, current);
  const conditionPrices = ((priceRow as any)?.condition_prices ?? {}) as Record<string, Record<string, number>>;

  // Per-variant data (finish × condition): powers the condition-table movement column
  // and the chart's condition/printing switcher.
  const variants = extractApiVariants(raw);
  const variantByKey = new Map(variants.map((v) => [`${v.finishKey}|${v.conditionKey}`, v] as const));
  const chartSeries: { label: string; points: PricePoint[] }[] = [{ label: "Near Mint", points: valueHistory }];
  for (const v of variants) {
    if (v.points.length >= 2 && v.conditionKey !== "near_mint") {
      chartSeries.push({
        label: `${FINISH_LABEL[v.finishKey] ?? v.finishKey} · ${COND_LABEL[v.conditionKey] ?? v.conditionKey}`,
        points: v.points,
      });
    }
  }

  // Where the current price sits within the 30-day range (0 = low, 1 = high).
  const pos30 =
    stats?.posIn30d != null ? Math.max(0, Math.min(1, stats.posIn30d))
    : stats?.low30d != null && stats?.high30d != null && stats.high30d > stats.low30d && current != null
      ? Math.max(0, Math.min(1, (current - stats.low30d) / (stats.high30d - stats.low30d)))
      : null;

  // Marketplace availability across all copies of this card.
  const { data: listingRows } = cardIds.length
    ? await admin
        .from("collection_items")
        .select("id, user_id, for_sale, for_trade, list_price, grader, grade, condition")
        .in("card_id", cardIds)
        .or("for_sale.eq.true,for_trade.eq.true")
        .eq("on_hold", false)
    : { data: [] as any[] };
  const sellerIds = [...new Set((listingRows ?? []).map((l) => l.user_id))];
  const { data: sellers } = sellerIds.length
    ? await admin.from("profiles").select("id, username, banned").in("id", sellerIds)
    : { data: [] as { id: string; username: string; banned: boolean }[] };
  const sellerMap = new Map((sellers ?? []).filter((s) => !s.banned).map((s) => [s.id, s.username]));
  const listings = (listingRows ?? []).filter((l) => sellerMap.has(l.user_id));
  const forSale = listings.filter((l) => l.for_sale);
  const forTrade = listings.filter((l) => l.for_trade);
  const asks = forSale.map((l) => l.list_price).filter((p): p is number => p != null);
  const lowestAsk = asks.length ? Math.min(...asks) : null;

  // Viewer's own copies (RLS: own rows).
  let owned = 0;
  if (user && cardIds.length) {
    const { data: mine } = await supa.from("collection_items").select("quantity").eq("user_id", user.id).in("card_id", cardIds);
    owned = (mine ?? []).reduce((s, r) => s + ((r.quantity as number) ?? 1), 0);
  }

  // ── Vaultset activity: realized sales, wishlist demand, watchers ─────────────
  const { data: itemRows } = cardIds.length
    ? await admin.from("collection_items").select("id").in("card_id", cardIds)
    : { data: [] as { id: string }[] };
  const itemIds = (itemRows ?? []).map((r) => r.id);
  const isCatalogId = !id.startsWith("tcg:") && !id.startsWith("manual:");

  const [salesRes, watchersRes, wishRes, pullsRes, detail] = await Promise.all([
    itemIds.length
      ? admin.from("offers").select("offer_amount, updated_at").in("listing_id", itemIds).eq("status", "accepted").gt("offer_amount", 0)
      : Promise.resolve({ data: [] as { offer_amount: number; updated_at: string }[] }),
    itemIds.length
      ? admin.from("watchlist").select("user_id").in("item_id", itemIds)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    isCatalogId
      ? admin.from("wishlist_items").select("target_price").eq("pokemon_api_id", id)
      : Promise.resolve({ data: [] as { target_price: number | null }[] }),
    cardIds.length
      ? admin.from("pack_reveals").select("*", { count: "exact", head: true }).in("card_id", cardIds)
      : Promise.resolve({ count: 0 }),
    isCatalogId ? cachedCardDetail(id) : Promise.resolve(null as PokemonCardDetail | null),
  ]);
  const pullCount = (pullsRes as { count: number | null }).count ?? 0;

  const sales = (salesRes.data ?? [])
    .map((s) => ({ amount: Number(s.offer_amount), at: s.updated_at as string }))
    .sort((a, b) => b.at.localeCompare(a.at));
  const saleCount = sales.length;
  const lastSale = sales[0] ?? null;
  const avgSale = saleCount ? sales.reduce((s, x) => s + x.amount, 0) / saleCount : null;

  const watcherCount = new Set((watchersRes.data ?? []).map((w) => w.user_id)).size;

  const wishCount = (wishRes.data ?? []).length;
  const wishTargets = (wishRes.data ?? []).map((w) => w.target_price).filter((t): t is number => t != null).map(Number);
  const avgTarget = wishTargets.length ? wishTargets.reduce((a, b) => a + b, 0) / wishTargets.length : null;

  const hasActivity = saleCount > 0 || watcherCount > 0 || wishCount > 0 || pullCount > 0;

  const rarity = gd.rarity as string | undefined;
  const variant = gd.variant as string | undefined;
  const rarityLabel = rarity ? raritySystem.getDisplayLabel(rarity) : null;
  const variantLabel = variant ? (VARIANT_LABEL[variant] ?? variant) : null;
  // Variant chip only when it adds info beyond the rarity label (they often coincide).
  const showVariant = !!variantLabel && variantLabel !== rarityLabel;
  const isPromo = !!gd.is_promo;
  const isEx = !!gd.is_ex;
  const tcgUrl = ((priceRow as any)?.tcgplayer_url as string | null) ?? resolvedSr?.tcgplayer?.url ?? null;
  const updatedAt = (priceRow as any)?.updated_at as string | null;
  const gradedEntries = Object.entries(graded ?? {});

  // pokemontcg.io detail-derived values (EU prices, set totals, legality).
  const cm = detail?.cardmarket?.prices ?? null;
  const cmUrl = detail?.cardmarket?.url ?? null;
  const setTotal = detail?.set?.printedTotal ?? detail?.set?.total ?? null;
  const legal = detail?.legalities ?? {};
  const legalityStr = (([["Standard", legal.standard], ["Expanded", legal.expanded], ["Unlimited", legal.unlimited]] as const)
    .filter(([, v]) => v === "Legal").map(([k]) => k).join(", ")) || null;

  // ── Structured data (Product + Offer/AggregateOffer, BreadcrumbList) ─────────
  const canonicalUrl = `https://www.vaultset.app/card-data/${encodeURIComponent(id)}`;
  const askHigh = asks.length ? Math.max(...asks) : null;
  // Secondary-market collectible; a rolling validity horizon keeps Google from
  // flagging a missing `priceValidUntil` on the Offer. `validFrom` is the honest
  // start of that window — when this price was last refreshed.
  const priceValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const validFrom = (updatedAt ? new Date(updatedAt) : new Date()).toISOString().slice(0, 10);
  const itemCondition = "https://schema.org/UsedCondition";
  const offers = current != null
    ? (forSale.length > 0 && lowestAsk != null
        ? { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: lowestAsk, highPrice: askHigh ?? lowestAsk, offerCount: forSale.length, availability: "https://schema.org/InStock", itemCondition, validFrom, priceValidUntil, url: canonicalUrl }
        : { "@type": "Offer", priceCurrency: "USD", price: Number(current).toFixed(2), availability: "https://schema.org/InStock", itemCondition, validFrom, priceValidUntil, url: canonicalUrl })
    : null;
  // Natural product identifier: pokemontcg.io id is the productID; set+number is a human-readable sku.
  const sku = card.set_code && card.card_number ? `${card.set_code}-${card.card_number}` : undefined;
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card.name,
    ...(card.image_url ? { image: card.image_url } : {}),
    description: `${card.name}${card.card_number ? ` #${card.card_number}` : ""} from ${card.set_name} — market value, price history, condition & graded prices, and marketplace listings on Vaultset.`,
    category: "Trading Card",
    productID: id,
    ...(sku ? { sku } : {}),
    brand: { "@type": "Brand", name: card.game === "pokemon" ? "Pokémon" : card.game },
    url: canonicalUrl,
    ...(offers ? { offers } : {}),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Card Search", item: "https://www.vaultset.app/card-data" },
      ...(card.set_code ? [{ "@type": "ListItem", position: 2, name: card.set_name, item: `https://www.vaultset.app/sets/${encodeURIComponent(card.set_code)}` }] : []),
      { "@type": "ListItem", position: card.set_code ? 3 : 2, name: card.name, item: canonicalUrl },
    ],
  };

  return (
    <div className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Marketplace
      </Link>

      {/* Hero: compact image rail + card facts */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Image rail */}
        <div className="mx-auto w-full max-w-[16rem] md:mx-0 md:w-64 md:shrink-0 space-y-3">
          <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-2xl bg-surface-raised border border-border">
            {card.image_url ? (
              <Image src={card.image_url} alt={card.name} fill sizes="256px" className="object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
              </div>
            )}
          </div>
          {owned > 0 && (
            <Link href="/inventory" className="flex items-center justify-center gap-1.5 rounded-xl border border-gold/30 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10 transition-colors">
              In your vault · {owned} {owned === 1 ? "copy" : "copies"}
            </Link>
          )}
          {tcgUrl && (
            <a href={tcgUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors">
              View on TCGplayer
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            </a>
          )}
        </div>

        {/* Facts */}
        <div className="flex-1 min-w-0 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="rounded-full bg-surface-raised border border-border px-2 py-0.5 text-xs text-foreground-muted capitalize">{card.game}</span>
              {isPromo && <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">Promo</span>}
              {isEx && <span className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs text-gold">ex</span>}
            </div>
            <h1 className="text-3xl font-bold text-foreground leading-tight">{card.name}</h1>
            <p className="mt-1 text-foreground-muted">
              {card.set_name}{card.card_number ? ` · #${card.card_number}${setTotal ? `/${setTotal}` : ""}` : ""}{card.year ? ` · ${card.year}` : ""}
            </p>
            {(rarity || showVariant) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {rarity && (
                  <span className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground-muted">
                    <RarityLabel rarity={rarity} />
                  </span>
                )}
                {showVariant && (
                  <span className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground-muted">{variantLabel}</span>
                )}
              </div>
            )}
          </div>

          {/* Market value */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Market Value <span className="normal-case">(NM)</span></p>
                <p className="mt-1 text-4xl font-bold text-gold leading-none">{money(current)}</p>
              </div>
              {change24h && (
                <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <span>24h</span>
                  <DailyChange change={change24h} href="#value-chart" />
                </span>
              )}
            </div>

            {stats ? (
              <div className="mt-4 grid grid-cols-4 gap-2">
                <PctChip label="24h" pct={stats.change24hrPct} />
                <PctChip label="7d" pct={stats.change7dPct} />
                <PctChip label="30d" pct={stats.change30dPct} />
                <PctChip label="90d" pct={stats.change90dPct} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-foreground-muted">Detailed price movement isn&apos;t available for this card&apos;s price source yet.</p>
            )}
          </div>

          {/* Availability */}
          {(forSale.length > 0 || forTrade.length > 0) && (
            <div className="flex flex-wrap gap-3">
              {forSale.length > 0 && (
                <a href="#marketplace" className="rounded-xl border border-border bg-surface px-4 py-2 text-sm text-foreground hover:border-gold/40 transition-colors">
                  <span className="font-semibold text-gold">{forSale.length}</span> for sale{lowestAsk != null ? ` · from ${money(lowestAsk)}` : ""}
                </a>
              )}
              {forTrade.length > 0 && (
                <a href="#marketplace" className="rounded-xl border border-border bg-surface px-4 py-2 text-sm text-blue-400 hover:border-blue-400/40 transition-colors">
                  <span className="font-semibold">{forTrade.length}</span> open to trade
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Value over time */}
      <div id="value-chart" className="scroll-mt-24">
        <CardValueChart series={chartSeries} title="Market Value Over Time" />
      </div>

      {/* Price insights */}
      {stats && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Price Insights</h2>

          {pos30 != null && stats.low30d != null && stats.high30d != null && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-foreground-muted">30-day range</span>
                <span className="text-foreground-muted">{Math.round(pos30 * 100)}% of range</span>
              </div>
              <div className="relative h-2 rounded-full bg-surface-raised">
                <div
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-gold border-2 border-surface shadow"
                  style={{ left: `calc(${pos30 * 100}% - 7px)` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs mt-1.5">
                <span className="font-medium text-foreground">{money(stats.low30d)}</span>
                <span className="font-medium text-foreground">{money(stats.high30d)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
            <Stat label="30d range" value={priceRange(stats.low30d, stats.high30d)} />
            <Stat label="90d range" value={priceRange(stats.low90d, stats.high90d)} />
            <Stat label="1-year range" value={priceRange(stats.low1y, stats.high1y)} />
            <Stat label="30d average" value={money(stats.avg30d)} />
            <Stat label="All-time low" value={stats.allTimeLow != null ? `${money(stats.allTimeLow)}${stats.allTimeLowDate ? ` · ${fmtDate(stats.allTimeLowDate)}` : ""}` : "—"} />
            <Stat label="All-time high" value={stats.allTimeHigh != null ? `${money(stats.allTimeHigh)}${stats.allTimeHighDate ? ` · ${fmtDate(stats.allTimeHighDate)}` : ""}` : "—"} />
          </div>

          {(stats.volatility30dPct != null || stats.repricings30d != null || (stats.trend30d != null && stats.trend30d !== 0)) && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {stats.volatility30dPct != null && (
                <Chip label="Volatility" value={volLabel(stats.volatility30dPct)} tone={volTone(stats.volatility30dPct)} />
              )}
              {stats.repricings30d != null && (
                <Chip label="Activity" value={liqLabel(stats.repricings30d)} tone="muted" />
              )}
              {stats.trend30d != null && stats.trend30d !== 0 && (
                <Chip label="30d trend" value={stats.trend30d > 0 ? "Rising" : "Falling"} tone={stats.trend30d > 0 ? "up" : "down"} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Price by condition */}
      {Object.keys(conditionPrices).length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Price by Condition <span className="text-xs font-normal text-foreground-muted">· price &amp; 24h change</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-foreground-muted">
                  <th className="text-left font-medium py-2 pr-4">Finish</th>
                  {COND_ORDER.map((c) => <th key={c} className="text-right font-medium py-2 px-3">{COND_LABEL[c]}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(conditionPrices).map(([fk, byCond]) => (
                  <tr key={fk} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 text-foreground align-top">{FINISH_LABEL[fk] ?? fk}</td>
                    {COND_ORDER.map((c) => {
                      const chg = variantByKey.get(`${fk}|${c}`)?.change24hrPct;
                      return (
                        <td key={c} className="py-2 px-3 text-right align-top">
                          {byCond[c] != null ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-foreground">{money(byCond[c])}</span>
                              {chg != null && chg !== 0 && (
                                <span className={`text-[10px] ${chg > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  {chg > 0 ? "+" : ""}{chg.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-foreground-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cardmarket (EU) prices */}
      {cm && (cm.trendPrice != null || cm.averageSellPrice != null || cm.avg7 != null) && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Cardmarket <span className="text-xs font-normal text-foreground-muted">· Europe (EUR)</span></h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3 text-xs">
            <Stat label="Trend" value={eur(cm.trendPrice)} />
            <Stat label="Avg sell" value={eur(cm.averageSellPrice)} />
            <Stat label="7-day avg" value={eur(cm.avg7)} />
            <Stat label="30-day avg" value={eur(cm.avg30)} />
            <Stat label="Low" value={eur(cm.lowPrice)} />
          </div>
          {cmUrl && (
            <a href={cmUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-gold transition-colors">
              View on Cardmarket
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            </a>
          )}
        </div>
      )}

      {/* Graded prices */}
      {gradedEntries.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Graded Prices <span className="text-xs font-normal text-foreground-muted">· eBay medians</span></h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gradedEntries.map(([grader, byGrade]) => (
              <div key={grader} className="rounded-xl border border-border bg-surface-raised p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted mb-2">{grader}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(byGrade).sort((a, b) => Number(b[0]) - Number(a[0])).map(([grade, price]) => (
                    <span key={grade} className="text-sm"><span className="text-foreground-muted">{grade}</span> <span className="font-medium text-foreground">{money(price)}</span></span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card details */}
      {detail && (detail.artist || detail.hp || detail.types?.length || (detail.attacks?.length ?? 0) > 0 || detail.flavorText) && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Card Details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3 text-xs">
            {detail.artist ? <Stat label="Illustrator" value={detail.artist} /> : null}
            {detail.hp ? <Stat label="HP" value={detail.hp} /> : null}
            {detail.types?.length ? <Stat label={detail.types.length > 1 ? "Types" : "Type"} value={detail.types.join(", ")} /> : null}
            {detail.subtypes?.length ? <Stat label="Subtype" value={detail.subtypes.join(", ")} /> : null}
            {detail.evolvesFrom ? <Stat label="Evolves from" value={detail.evolvesFrom} /> : null}
            {detail.nationalPokedexNumbers?.length ? <Stat label="Pokédex" value={detail.nationalPokedexNumbers.map((n) => `#${n}`).join(", ")} /> : null}
            {detail.regulationMark ? <Stat label="Regulation" value={detail.regulationMark} /> : null}
            {legalityStr ? <Stat label="Legality" value={legalityStr} /> : null}
            {detail.set?.series ? <Stat label="Series" value={detail.set.series} /> : null}
            {detail.set?.releaseDate ? <Stat label="Released" value={detail.set.releaseDate} /> : null}
          </div>

          {detail.abilities && detail.abilities.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              {detail.abilities.map((a, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-foreground">
                    <span className="text-gold">{a.type ?? "Ability"}</span> · {a.name}
                  </p>
                  {a.text && <p className="mt-0.5 text-xs text-foreground-muted leading-relaxed">{a.text}</p>}
                </div>
              ))}
            </div>
          )}

          {detail.attacks && detail.attacks.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              {detail.attacks.map((a, i) => (
                <div key={i}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    {a.damage && <span className="text-sm font-semibold text-gold">{a.damage}</span>}
                  </div>
                  {a.text && <p className="mt-0.5 text-xs text-foreground-muted leading-relaxed">{a.text}</p>}
                </div>
              ))}
            </div>
          )}

          {detail.flavorText && (
            <p className="border-t border-border pt-4 text-xs italic text-foreground-muted leading-relaxed">{detail.flavorText}</p>
          )}
        </div>
      )}

      {/* Vaultset activity */}
      {hasActivity && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Vaultset Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {lastSale && <ActivityTile label="Last sold" value={money(lastSale.amount)} sub={fmtDate(lastSale.at.slice(0, 10))} />}
            {saleCount > 0 && <ActivityTile label={saleCount === 1 ? "Sale" : "Sales"} value={String(saleCount)} sub={avgSale != null ? `avg ${money(avgSale)}` : undefined} />}
            {wishCount > 0 && <ActivityTile label="Wanted by" value={String(wishCount)} sub={avgTarget != null ? `avg target ${money(avgTarget)}` : `collector${wishCount !== 1 ? "s" : ""}`} />}
            {watcherCount > 0 && <ActivityTile label="Watching" value={String(watcherCount)} sub={`collector${watcherCount !== 1 ? "s" : ""}`} />}
            {pullCount > 0 && <ActivityTile label="Pulled" value={String(pullCount)} sub={`time${pullCount !== 1 ? "s" : ""}`} />}
          </div>
        </div>
      )}

      {/* Available on the marketplace */}
      {listings.length > 0 && (
        <div id="marketplace" className="space-y-4 scroll-mt-24">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-foreground">Available on the Marketplace <span className="text-sm font-normal text-foreground-muted">({listings.length})</span></h2>
            {!user && (
              <Link href="/login" className="text-xs font-medium text-gold hover:text-gold-light transition-colors">
                Sign in to view listings →
              </Link>
            )}
          </div>
          {!user && (
            <p className="text-xs text-foreground-muted">
              <Link href="/register" className="text-gold hover:text-gold-light transition-colors">Create a free account</Link>
              {" "}or{" "}
              <Link href="/login" className="text-gold hover:text-gold-light transition-colors">sign in</Link>
              {" "}to view listings and make offers.
            </p>
          )}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {listings.slice(0, 12).map((l) => {
              const inner = (
                <>
                  <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-lg bg-surface-raised">
                    {card.image_url && <Image src={card.image_url} alt={card.name} fill sizes="160px" className="object-contain" />}
                    {!user && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted">
                          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted truncate">@{sellerMap.get(l.user_id)}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground-muted">
                      {l.grader ? `${l.grader} ${l.grade}` : (l.condition ? COND_LABEL[l.condition] ?? l.condition : "")}
                    </span>
                    {l.for_sale && l.list_price != null ? (
                      <span className="text-sm font-semibold text-gold">{money(l.list_price)}</span>
                    ) : (
                      <span className="text-xs text-blue-400">Trade</span>
                    )}
                  </div>
                </>
              );
              const base = "flex-shrink-0 w-40 rounded-xl border border-border bg-surface p-3 space-y-1";
              return user ? (
                <Link key={l.id} href={`/marketplace/${l.id}`} className={`${base} hover:border-gold/30 hover:bg-surface-raised transition-colors`}>
                  {inner}
                </Link>
              ) : (
                <div key={l.id} className={`${base} cursor-not-allowed`} aria-disabled="true" title="Sign in to view this listing">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Explore related hubs — internal links for discovery + crawl depth */}
      <div className="flex flex-wrap gap-2 text-xs">
        {card.set_code && (
          <Link href={`/sets/${encodeURIComponent(card.set_code)}`} className="rounded-full border border-border bg-surface px-3 py-1.5 text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors">
            More from {card.set_name} →
          </Link>
        )}
        {rarity && (
          <Link href={`/rarity/${encodeURIComponent(rarity)}`} className="rounded-full border border-border bg-surface px-3 py-1.5 text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors">
            All {raritySystem.getDisplayLabel(rarity)} cards →
          </Link>
        )}
        <Link href={`/pokemon/${encodeURIComponent(speciesSlug(card.name))}`} className="rounded-full border border-border bg-surface px-3 py-1.5 text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors">
          All {speciesName(card.name)} cards →
        </Link>
      </div>

      <p className="text-xs text-foreground-muted">
        {(priceRow as any)?.source ? `Pricing source: ${(priceRow as any).source === "justtcg" ? "JustTCG" : (priceRow as any).source}. ` : ""}
        {updatedAt ? `Updated ${new Date(updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : ""}
      </p>
    </div>
  );
}

function PctChip({ label, pct }: { label: string; pct: number | null }) {
  const up = pct != null && pct > 0;
  const down = pct != null && pct < 0;
  const color = up ? "text-emerald-400" : down ? "text-red-400" : "text-foreground-muted";
  return (
    <div className="rounded-xl border border-border bg-surface-raised px-2 py-2 text-center">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{pct == null ? "—" : `${up ? "+" : ""}${pct.toFixed(1)}%`}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-foreground-muted">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}

function ActivityTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-foreground-muted">{sub}</p>}
    </div>
  );
}

function priceRange(lo: number | null, hi: number | null): string {
  if (lo == null && hi == null) return "—";
  return `${money(lo)} – ${money(hi)}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Tone = "up" | "down" | "warn" | "muted";
function volLabel(pct: number): string {
  return pct < 8 ? "Low" : pct < 20 ? "Medium" : "High";
}
function volTone(pct: number): Tone {
  return pct < 8 ? "up" : pct < 20 ? "warn" : "down";
}
function liqLabel(n: number): string {
  return n > 30 ? "Very active" : n > 8 ? "Active" : n > 0 ? "Light" : "Quiet";
}

function Chip({ label, value, tone = "muted" }: { label: string; value: string; tone?: Tone }) {
  const cls =
    tone === "up" ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
    : tone === "down" ? "text-red-400 border-red-400/20 bg-red-400/5"
    : tone === "warn" ? "text-gold border-gold/20 bg-gold/5"
    : "text-foreground-muted border-border bg-surface-raised";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${cls}`}>
      <span className="opacity-70">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
