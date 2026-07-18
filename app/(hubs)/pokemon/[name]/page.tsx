import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSpeciesCards, distinctSpecies } from "@/lib/hubs/hubQueries";
import { HubCardGrid } from "@/components/hubs/HubCardGrid";
import { speciesName } from "@/lib/cards/species";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await distinctSpecies()).map((name) => ({ name }));
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const cards = await getSpeciesCards(name);
  if (cards.length === 0) return { title: "Not Found", robots: { index: false } };
  const display = speciesName(cards[0].name);
  return {
    title: `All ${display} Cards — Prices & Values`,
    description: `Every ${display} Pokémon card across sets with live market values on Vaultset. ${cards.length} cards tracked, sorted by value.`,
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
          Every {display} card across Pokémon TCG sets, with live market values and sorted by worth.
          Click any card for its full price history, condition and graded prices, and listings.
        </p>
      </div>
      <HubCardGrid cards={cards} showSet />
    </div>
  );
}
