import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { InventoryGrid } from "@/components/InventoryGrid";

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

  const totalCards = items?.reduce((sum, i) => sum + (i.quantity ?? 1), 0) ?? 0;

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

      <InventoryGrid items={items ?? []} />
    </div>
  );
}
