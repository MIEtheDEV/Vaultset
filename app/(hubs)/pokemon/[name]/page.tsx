import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSpeciesCards, topSpecies } from "@/lib/hubs/hubQueries";
import { HubCardGrid } from "@/components/hubs/HubCardGrid";
import { ChaseCards } from "@/components/hubs/ChaseCards";
import { speciesName } from "@/lib/cards/species";

export const revalidate = 86400;
export const dynamicParams = true;

// Only the busiest species prerender; the long tail is ISR'd on first request.
export async function generateStaticParams() {
  return (await topSpecies()).map((name) => ({ name }));
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const cards = await getSpeciesCards(name);
  if (cards.length === 0) return { title: "Not Found", robots: { index: false } };
  const display = speciesName(cards[0].name);
  return {
    title: `All ${display} Cards — Prices & Values`,
    description: `Every ${display} Pokémon card across sets on Vaultset — ${cards.length} cards, newest first, with market values where available.`,
    alternates: { canonical: `/pokemon/${encodeURIComponent(name)}` },
  };
}

export default async function PokemonPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const cards = await getSpeciesCards(name);
  if (cards.length === 0) notFound();

  const display = speciesName(cards[0].name);
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Card Search", item: "https://www.vaultset.app/card-data" },
      { "@type": "ListItem", position: 2, name: `${display} cards`, item: `https://www.vaultset.app/pokemon/${encodeURIComponent(name)}` },
    ],
  };

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div>
        <h1 className="text-3xl font-bold text-foreground">All {display} Cards</h1>
        <p className="mt-2 text-foreground-muted max-w-2xl">
          All {cards.length} {display} cards across Pokémon TCG sets, newest set first, with live
          market values where we have them. Click any card for its full price history, condition and
          graded prices, and listings.
        </p>
      </div>
      <ChaseCards
        cards={cards}
        subtitle={`The rarest ${display} cards ever printed`}
        showSet
      />
      <HubCardGrid cards={cards} showSet />
    </div>
  );
}
