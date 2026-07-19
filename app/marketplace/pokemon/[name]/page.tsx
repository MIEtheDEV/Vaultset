import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getListedBySpecies, distinctListedSpecies } from "@/lib/hubs/hubQueries";
import { MarketplaceHubGrid } from "@/components/hubs/MarketplaceHubGrid";
import { speciesName } from "@/lib/cards/species";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await distinctListedSpecies()).map((name) => ({ name }));
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const cards = await getListedBySpecies(name);
  if (cards.length === 0) return { title: "No Listings", robots: { index: false } };
  const display = speciesName(cards[0].name);
  return {
    title: `${display} Cards For Sale & Trade`,
    description: `Buy, sell, and trade ${display} Pokémon cards on Vaultset. ${cards.length} card${cards.length !== 1 ? "s" : ""} listed across sets with live market values.`,
    alternates: { canonical: `/marketplace/pokemon/${encodeURIComponent(name)}` },
  };
}

export default async function MarketplacePokemonPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const cards = await getListedBySpecies(name);
  if (cards.length === 0) notFound();

  const display = speciesName(cards[0].name);
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Marketplace", item: "https://www.vaultset.app/marketplace" },
      { "@type": "ListItem", position: 2, name: `${display} for sale`, item: `https://www.vaultset.app/marketplace/pokemon/${encodeURIComponent(name)}` },
    ],
  };

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav className="text-sm text-foreground-muted">
        <Link href="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{display}</span>
      </nav>

      <div>
        <h1 className="text-3xl font-bold text-foreground">{display} Cards For Sale &amp; Trade</h1>
        <p className="mt-2 text-foreground-muted max-w-2xl">
          {display} cards listed by collectors on Vaultset across sets, with live market values. Open a
          card to see all listings and grades —{" "}
          <Link href="/register" className="text-gold underline underline-offset-2 hover:text-gold-light transition-colors">create a free account</Link> or{" "}
          <Link href="/login" className="text-gold underline underline-offset-2 hover:text-gold-light transition-colors">sign in</Link> to buy or make an offer.
        </p>
        <p className="mt-2 text-sm">
          <Link href={`/pokemon/${encodeURIComponent(name)}`} className="text-gold hover:text-gold-light transition-colors">
            See all {display} cards & values →
          </Link>
        </p>
      </div>

      <MarketplaceHubGrid cards={cards} />
    </div>
  );
}
