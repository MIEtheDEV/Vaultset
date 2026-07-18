import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRarityCards, distinctRarities } from "@/lib/hubs/hubQueries";
import { HubCardGrid } from "@/components/hubs/HubCardGrid";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";
import { RaritySymbol } from "@/components/RaritySymbol";

const raritySystem = new PokemonRaritySystem();

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await distinctRarities()).map((rarity) => ({ rarity }));
}

export async function generateMetadata({ params }: { params: Promise<{ rarity: string }> }): Promise<Metadata> {
  const { rarity } = await params;
  const label = raritySystem.getDisplayLabel(rarity) || rarity;
  const cards = await getRarityCards(rarity);
  if (cards.length === 0) return { title: "Rarity Not Found", robots: { index: false } };
  return {
    title: `${label} Pokémon Cards — Prices & Values`,
    description: `Browse ${label} Pokémon cards with live market values on Vaultset. ${cards.length} cards tracked, sorted by value.`,
    alternates: { canonical: `/rarity/${encodeURIComponent(rarity)}` },
  };
}

export default async function RarityPage({ params }: { params: Promise<{ rarity: string }> }) {
  const { rarity } = await params;
  const cards = await getRarityCards(rarity);
  if (cards.length === 0) notFound();

  const label = raritySystem.getDisplayLabel(rarity) || rarity;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Card Search", item: "https://www.vaultset.app/card-data" },
      { "@type": "ListItem", position: 2, name: `${label} cards`, item: `https://www.vaultset.app/rarity/${encodeURIComponent(rarity)}` },
    ],
  };

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold text-foreground">
          <RaritySymbol rarity={rarity} title={label} />
          <span>{label} Pokémon Cards</span>
        </h1>
        <p className="mt-2 text-foreground-muted max-w-2xl">
          {label} cards tracked on Vaultset, sorted by market value. Open any card for its full price
          history, condition and graded prices, and marketplace listings.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/sets" className="text-gold hover:text-gold-light transition-colors">Browse by set →</Link>
        </p>
      </div>
      <HubCardGrid cards={cards} showSet />
    </div>
  );
}
