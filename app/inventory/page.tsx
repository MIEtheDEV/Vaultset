import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { InventoryGrid } from "@/components/InventoryGrid";
import { MarkReceivedButton } from "@/components/MarkReceivedButton";
import { RefreshMarketButton } from "@/components/RefreshMarketButton";
import { MatchAllListingsButton } from "@/components/MatchAllListingsButton";
import { FillMissingPricesButton } from "@/components/FillMissingPricesButton";
import { hasProAccess } from "@/lib/proStatus";
import { utcToday, apiDailyChange } from "@/lib/priceHistory";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import { extractApiCardHistory } from "@/lib/pricing/cardHistory";

export const metadata: Metadata = {
  title: "Inventory",
  robots: { index: false },
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: items } = await supabase
    .from("collection_items")
    .select(`
      id,
      condition,
      finish,
      quantity,
      paid_price,
      list_price,
      market_price,
      for_sale,
      for_trade,
      grader,
      grade,
      acquired_at,
      transfer_status,
      from_offer_id,
      on_hold,
      hold_offer_id,
      cards (
        id,
        game,
        name,
        set_name,
        card_number,
        year,
        image_url,
        game_data
      )
    `)
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const pendingItems = (items ?? []).filter((i) => (i as any).transfer_status === "pending");
  const regularItems = (items ?? []).filter((i) => (i as any).transfer_status !== "pending");
  const totalCards   = regularItems.reduce((sum, i) => sum + (i.quantity ?? 1), 0);

  // Day-over-day market-value change per card. Prefer the provider's real 24h move
  // (JustTCG `priceChange24hr`, from card_prices.raw) so freshly-added cards show a
  // real ticker immediately; fall back to our own daily snapshot diff, else nothing.
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: histRows } = await supabase
    .from("price_history")
    .select("collection_item_id, market_price, snapshotted_at")
    .eq("user_id", user!.id)
    .lt("snapshotted_at", utcToday())
    .gte("snapshotted_at", windowStart)
    .order("snapshotted_at", { ascending: false });

  const prevValue = new Map<string, number>();
  for (const r of histRows ?? []) {
    if (!prevValue.has(r.collection_item_id)) prevValue.set(r.collection_item_id, Number(r.market_price));
  }

  // Raw pricing payloads (JustTCG) for the cards in view, keyed by their cache id.
  const apiIds = new Set<string>();
  for (const it of regularItems) {
    const c = Array.isArray(it.cards) ? it.cards[0] : it.cards;
    const id = c ? priceApiId((c.game_data ?? {}) as Record<string, unknown>, c.id) : null;
    if (id) apiIds.add(id);
  }
  const { data: priceRows } = apiIds.size
    ? await supabase.from("card_prices").select("card_api_id, raw").in("card_api_id", [...apiIds])
    : { data: [] as { card_api_id: string; raw: unknown }[] };
  const rawByApiId = new Map<string, unknown>();
  for (const row of (priceRows ?? []) as { card_api_id: string; raw: unknown }[]) rawByApiId.set(row.card_api_id, row.raw);

  const dailyChanges: Record<string, { abs: number; pct: number }> = {};
  for (const it of regularItems) {
    if (it.market_price == null) continue;
    const c = Array.isArray(it.cards) ? it.cards[0] : it.cards;
    const gd = (c?.game_data ?? {}) as Record<string, unknown>;
    const id = c ? priceApiId(gd, c.id) : null;
    const api = id ? extractApiCardHistory(rawByApiId.get(id), {
      finish: it.finish, edition: (gd.edition as string) ?? null, condition: it.condition, grader: it.grader,
    }) : null;

    let change = apiDailyChange(api?.change24hrPct, it.market_price);
    if (!change) {
      const prev = prevValue.get(it.id);
      if (prev != null && prev !== 0) {
        const abs = it.market_price - prev;
        change = { abs, pct: (abs / prev) * 100 };
      }
    }
    if (change) dailyChanges[it.id] = change;
  }

  // Find which inventory items are currently proposed in a pending trade offer
  const { data: pendingSentOffers } = await supabase
    .from("offers")
    .select("id")
    .eq("sender_id", user!.id)
    .eq("status", "pending");

  const pendingOfferIds = (pendingSentOffers ?? []).map((o) => o.id);

  const { data: proposedRows } = pendingOfferIds.length > 0
    ? await supabase
        .from("offer_items")
        .select("collection_item_id")
        .in("offer_id", pendingOfferIds)
        .eq("role", "offered")
    : { data: [] as { collection_item_id: string }[] };

  const proposedItemIds = (proposedRows ?? []).map((r) => r.collection_item_id);

  const { data: refreshLog } = await supabase
    .from("market_refresh_log")
    .select("refreshed_at")
    .eq("user_id", user!.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_pro, pro_plan, pro_expires_at, pro_auto_renews")
    .eq("id", user!.id)
    .single();
  const canPro = hasProAccess(profile as any); // manual market refresh is Pro

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {totalCards === 0
              ? "No cards yet — add your first one."
              : `${totalCards} card${totalCards === 1 ? "" : "s"} in your vault`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Link
          href="/inventory/import"
          className="inline-flex w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import
        </Link>
        <Link
          href="/inventory/export"
          className="inline-flex w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export
        </Link>
        <Link
          href="/inventory/products"
          className="inline-flex w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          Products
        </Link>
        <Link
          href="/inventory/add"
          className="inline-flex w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Card
        </Link>
        </div>
      </div>

      {/* Pricing actions: market value (estimate) vs. listing price are kept separate */}
      {regularItems.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Pricing</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Refresh tracked market values, then optionally match your for-sale listings to them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {canPro ? (
              <RefreshMarketButton lastRefreshedAt={refreshLog?.refreshed_at ?? null} />
            ) : (
              <Link href="/pricing" className="text-xs text-foreground-muted hover:text-gold transition-colors">
                Prices update automatically · <span className="text-gold">Upgrade for on-demand refresh →</span>
              </Link>
            )}
            <FillMissingPricesButton />
            <MatchAllListingsButton />
          </div>
        </div>
      )}

      {/* Pending Arrivals */}
      {pendingItems.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              Pending Arrivals
              <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-medium text-amber-400">
                {pendingItems.length}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Cards from accepted offers awaiting delivery. Mark as received once in hand.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 divide-y divide-border overflow-hidden">
            {pendingItems.map((item) => {
              const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
              const offerId = (item as any).from_offer_id as string | null;
              return (
                <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                  {card?.image_url ? (
                    <div className="relative w-10 h-14 flex-shrink-0 rounded-md overflow-hidden bg-surface-raised">
                      <Image src={card.image_url} alt={card.name} fill sizes="40px" className="object-contain" />
                    </div>
                  ) : (
                    <div className="w-10 h-14 flex-shrink-0 rounded-md bg-surface-raised" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{card?.name ?? "Unknown card"}</p>
                    <p className="text-xs text-foreground-muted truncate">{card?.set_name ?? ""}</p>
                    {item.condition && (
                      <p className="text-xs text-foreground-muted capitalize">{item.condition.replace(/_/g, " ")}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {offerId && <MarkReceivedButton offerId={offerId} />}
                    {offerId && (
                      <a href={`/offers/${offerId}`} className="text-xs text-foreground-muted hover:text-gold transition-colors">
                        View offer →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <InventoryGrid items={regularItems} proposedItemIds={proposedItemIds} canRefresh={canPro} dailyChanges={dailyChanges} />
    </div>
  );
}
