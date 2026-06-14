import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { InventoryGrid } from "@/components/InventoryGrid";
import { MarkReceivedButton } from "@/components/MarkReceivedButton";

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
        <div className="flex items-center gap-3">
        <Link
          href="/inventory/import"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
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
          className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
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
          className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          Products
        </Link>
        <Link
          href="/inventory/add"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Card
        </Link>
        </div>
      </div>

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

      <InventoryGrid items={regularItems} proposedItemIds={proposedItemIds} />
    </div>
  );
}
