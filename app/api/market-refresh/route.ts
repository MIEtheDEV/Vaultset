import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { PriceFetchEngine } from "@/lib/pricing/PriceFetchEngine";
import { propagateMarketValues } from "@/lib/pricing/propagateMarketValues";
import { refreshSealedProductPrices } from "@/lib/pricing/sealedProductPrices";
import { ensureGradedPrices } from "@/lib/pricing/gradedPrices";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import type { CardRef } from "@/lib/pricing/PriceProvider";
import { isPro } from "@/lib/isPro";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerEmail = process.env.OWNER_EMAIL;
  const isOwner = !!ownerEmail && user.email === ownerEmail;
  const admin   = createAdminClient();

  // On-demand bulk refresh is a Pro feature. Free users get cross-user cache
  // propagation + ~24h bedrock pricing; they cannot trigger a manual refresh.
  if (!isOwner && !(await isPro(user.id))) {
    return NextResponse.json({ error: "On-demand refresh is a Pro feature." }, { status: 403 });
  }
  // Pro is intentionally uncapped: the cache-first engine (6h) makes repeat
  // calls cheap, and price_api_usage caps provider spend per day.

  const { data: items } = await supabase
    .from("collection_items")
    .select("id, finish, condition, grader, grade, market_price, for_sale, cards ( id, name, set_name, set_code, card_number, game_data )")
    .eq("user_id", user.id);

  type Entry = {
    itemId: string;
    finish: string | null;
    edition: string | null;
    condition: string | null;
    grader: string | null;
    grade: number | null;
  };
  const byApiId = new Map<string, Entry[]>();
  const refs    = new Map<string, CardRef>();
  // Per-card flags used to prioritise the limited daily JustTCG budget:
  //   needsValue — at least one item has NO market value yet
  //   listed     — at least one item is currently for sale
  const needsValue = new Set<string>();
  const listed     = new Set<string>();

  for (const item of items ?? []) {
    const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
    const gd   = ((card as any)?.game_data ?? {}) as Record<string, unknown>;
    const apiId = priceApiId(gd, (card as any)?.id);
    if (!apiId) continue;

    if (!refs.has(apiId)) {
      refs.set(apiId, {
        apiId,
        tcgplayerId: (gd.tcgplayer_id as string) ?? null,
        name:    (card as any)?.name        ?? undefined,
        setName: (card as any)?.set_name    ?? undefined,
        setCode: (card as any)?.set_code    ?? undefined,
        number:  (card as any)?.card_number ?? undefined,
      });
    }

    if ((item as any).market_price == null) needsValue.add(apiId);
    if ((item as any).for_sale)             listed.add(apiId);

    const entry: Entry = {
      itemId:    item.id,
      finish:    (item as any).finish ?? null,
      edition:   (gd.edition as string) ?? null,
      condition: (item as any).condition ?? null,
      grader:    (item as any).grader ?? null,
      grade:     (item as any).grade ?? null,
    };
    if (!byApiId.has(apiId)) byApiId.set(apiId, []);
    byApiId.get(apiId)!.push(entry);
  }

  // Priority for spending the limited daily JustTCG budget (lower = sooner).
  // Listings come first (those drive sales); within each group, cards with no
  // value yet outrank cards that already have one.
  //   0: listed   & no value
  //   1: listed   & has value
  //   2: unlisted & no value
  //   3: unlisted & has value
  const priority = (apiId: string): number =>
    (listed.has(apiId) ? 0 : 2) + (needsValue.has(apiId) ? 0 : 1);

  const orderedRefs = [...refs.values()].sort(
    (a, b) => priority(a.apiId) - priority(b.apiId),
  );

  // Resolve prices through the cache-first cascading engine (writes use admin).
  // Gap-aware: bedrock prices everything it can for free, then JustTCG resolves
  // only the cards pokemontcg.io lacks (e.g. newer sets), spending the limited
  // daily budget on real gaps in the priority order above rather than on every
  // unmapped card.
  const engine = new PriceFetchEngine(admin);
  const priced = await engine.getPricesGapAware(orderedRefs);

  const provider = new PokemonTCGProvider();

  // Build per-item updates, applying finish/edition/condition/grade multipliers.
  const updates: { id: string; market_price: number }[] = [];
  for (const [apiId, entries] of byApiId) {
    const resolved = priced.get(apiId);
    if (!resolved) continue;
    const tcgplayer = { prices: resolved.prices } as TcgPlayerData;
    // Fetch graded slab prices only when a graded item references this card
    // (24h-cached + budget-guarded inside ensureGradedPrices).
    const needsGraded = entries.some((e) => e.grader && e.grade != null);
    const gradedPrices = needsGraded ? await ensureGradedPrices(admin, apiId) : null;
    for (const entry of entries) {
      const price = provider.getMarketPrice(
        tcgplayer, entry.finish, entry.edition, entry.condition, entry.grader, entry.grade,
        resolved.conditionPrices, gradedPrices,
      );
      if (price != null) updates.push({ id: entry.itemId, market_price: price });
    }
  }

  // Apply updates in parallel
  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from("collection_items")
        .update({ market_price: u.market_price })
        .eq("id", u.id),
    ),
  );
  const updated = results.filter((r) => !r.error).length;

  // Fan freshly-fetched prices out to ALL holders of the same cards (market
  // value only — never list_price). Cache hits are skipped to avoid needless
  // fan-out. This is why one user's refresh updates everyone's market value.
  const freshIds = [...priced.values()].filter((p) => !p.fromCache).map((p) => p.cardApiId);
  await propagateMarketValues(admin, freshIds);

  // Refresh sealed product market values (ETBs, booster boxes, …) through the
  // same engine/cache, keyed by their TCGplayer product id. Best-effort: a
  // failure here must not fail the (successful) singles refresh above.
  let sealedUpdated = 0;
  try {
    sealedUpdated = await refreshSealedProductPrices(admin, user.id);
  } catch (err) {
    console.warn(`[pricing] sealed product refresh failed: ${(err as Error).message}`);
  }

  await admin
    .from("market_refresh_log")
    .upsert({ user_id: user.id, refreshed_at: new Date().toISOString() });

  // ── Price alert check ──────────────────────────────────────────────────────
  const { data: alertMatches } = await admin
    .rpc("check_wishlist_price_alerts", { p_user_id: user.id });

  if (alertMatches && alertMatches.length > 0) {
    // Find listings already notified to avoid duplicates
    const listingIds = alertMatches.map((m: any) => m.listing_id as string);
    const { data: existingNotifs } = await admin
      .from("notifications")
      .select("data")
      .eq("user_id", user.id)
      .eq("type", "price_alert")
      .in("data->>'listing_id'", listingIds);

    const alreadyNotified = new Set(
      (existingNotifs ?? []).map((n) => (n.data as any)?.listing_id as string)
    );

    const newAlerts = alertMatches.filter((m: any) => !alreadyNotified.has(m.listing_id as string));

    if (newAlerts.length > 0) {
      // Inserting the notification fires the `push_dispatch_after_insert`
      // trigger, which delivers web push (respecting the user's prefs). No
      // direct push call here — the trigger is the single delivery chokepoint.
      await admin.from("notifications").insert(
        newAlerts.map((m: any) => ({
          user_id:  user.id,
          type:     "price_alert",
          actor_id: null,
          data: {
            listing_id:  m.listing_id,
            card_name:   m.card_name,
            list_price:  m.list_price,
            seller_username: m.seller_username,
          },
        }))
      );
    }
  }

  return NextResponse.json({ updated, sealedUpdated });
}
