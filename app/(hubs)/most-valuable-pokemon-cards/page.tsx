import type { Metadata } from "next";
import { getMostValuable } from "@/lib/hubs/hubQueries";
import { HubCardGrid } from "@/components/hubs/HubCardGrid";

export const revalidate = 21600;

export const metadata: Metadata = {
  title: "Most Valuable Pokémon Cards — Live Prices",
  description: "The most valuable Pokémon TCG cards tracked on Vaultset, ranked by live market value. See prices, condition breakdowns, and graded values for each.",
  alternates: { canonical: "/most-valuable-pokemon-cards" },
};

export default async function MostValuablePage() {
  const cards = await getMostValuable(100);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Most Valuable Pokémon Cards</h1>
        <p className="mt-2 text-foreground-muted max-w-2xl">
          The highest-value Pokémon TCG cards tracked on Vaultset right now, ranked by live market
          value. Open any card for its price history, condition and graded prices, and listings.
        </p>
      </div>
      <HubCardGrid cards={cards} showSet />
    </div>
  );
}
