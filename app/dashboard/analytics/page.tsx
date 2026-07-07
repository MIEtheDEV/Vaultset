import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { PortfolioAnalyticsClient } from "@/components/PortfolioAnalyticsClient";
import { ProUpsell } from "@/components/ProUpsell";
import { isPro } from "@/lib/isPro";
import { withLiveToday } from "@/lib/priceHistory";

export const metadata: Metadata = {
  title: "Portfolio Analytics",
  robots: { index: false },
};

const AnalyticsHeader = () => (
  <div className="flex items-center gap-4">
    <Link href="/dashboard" className="text-foreground-muted hover:text-foreground transition-colors">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </Link>
    <div>
      <h1 className="text-2xl font-bold text-foreground">Portfolio Analytics</h1>
      <p className="text-sm text-foreground-muted mt-0.5">ROI tracking and collection performance</p>
    </div>
  </div>
);

export default async function PortfolioAnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pro feature — show an upsell instead of the report for free users.
  if (!user || !(await isPro(user.id))) {
    return (
      <div className="space-y-8">
        <AnalyticsHeader />
        <ProUpsell
          title="Portfolio analytics & ROI"
          description="See cost basis, ROI, gainers/losers, and value-over-time across your whole collection with Pro."
        />
      </div>
    );
  }

  const [{ data: collectionData }, { data: priceHistoryRaw }] = await Promise.all([
    supabase
      .from("collection_items")
      .select(
        `id, quantity, paid_price, market_price, list_price, condition, grader, grade,
         cards ( name, set_name, card_number, image_url )`
      )
      .eq("user_id", user!.id),
    supabase
      .from("price_history")
      .select("snapshotted_at, market_price, collection_items(quantity)")
      .eq("user_id", user!.id)
      .order("snapshotted_at", { ascending: true }),
  ]);

  const items = collectionData ?? [];

  // "Market Value" = market_price × qty, cards only. No list_price fallback:
  // list_price is the owner's asking price, not a market value, so it must not
  // inflate this figure (keeps it identical to the dashboard + report definition).
  const totalMarketValue = items.reduce((sum, r) => {
    return sum + (r.market_price != null ? Number(r.market_price) * (r.quantity ?? 1) : 0);
  }, 0);

  const totalCostBasis = items.reduce((sum, r) => {
    if (r.paid_price == null) return sum;
    return sum + Number(r.paid_price) * (r.quantity ?? 1);
  }, 0);

  const coveredMarketValue = items.reduce((sum, r) => {
    if (r.paid_price == null) return sum;
    return sum + (r.market_price != null ? Number(r.market_price) * (r.quantity ?? 1) : 0);
  }, 0);

  const cardsWithCostBasis = items.filter((r) => r.paid_price != null).length;
  const totalCards = items.length;

  const portfolioSnapshots = Object.entries(
    (priceHistoryRaw ?? []).reduce<Record<string, number>>((acc, row) => {
      const qty = (row.collection_items as { quantity?: number } | null)?.quantity ?? 1;
      acc[row.snapshotted_at] =
        (acc[row.snapshotted_at] ?? 0) + Number(row.market_price) * qty;
      return acc;
    }, {})
  )
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  // End the series at the live "Current Value" so the chart matches the stat
  // (snapshots are daily; a refresh/edit moves the value after 02:00 UTC).
  const portfolioHistory = withLiveToday(portfolioSnapshots, totalMarketValue);

  const cards = items.map((item) => {
    const card = Array.isArray(item.cards) ? item.cards[0] : item.cards;
    return {
      id: item.id,
      name: card?.name ?? "Unknown",
      set_name: card?.set_name ?? "",
      card_number: card?.card_number ?? null,
      image_url: card?.image_url ?? null,
      quantity: item.quantity ?? 1,
      paid_price: item.paid_price != null ? Number(item.paid_price) : null,
      market_price:
        item.market_price != null
          ? Number(item.market_price)
          : item.list_price != null
          ? Number(item.list_price)
          : null,
      condition: item.condition ?? null,
      grader: item.grader ?? null,
      grade: item.grade ?? null,
    };
  });

  return (
    <div className="space-y-8">
      <AnalyticsHeader />

      <PortfolioAnalyticsClient
        portfolioHistory={portfolioHistory}
        totalMarketValue={totalMarketValue}
        totalCostBasis={totalCostBasis}
        coveredMarketValue={coveredMarketValue}
        cardsWithCostBasis={cardsWithCostBasis}
        totalCards={totalCards}
        cards={cards}
      />
    </div>
  );
}
