import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getListedBySet, distinctListedSetCodes } from "@/lib/hubs/hubQueries";
import { getPokemonSets } from "@/lib/sets/getPokemonSets";
import { MarketplaceHubGrid } from "@/components/hubs/MarketplaceHubGrid";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await distinctListedSetCodes()).map((setCode) => ({ setCode }));
}

export async function generateMetadata({ params }: { params: Promise<{ setCode: string }> }): Promise<Metadata> {
  const { setCode } = await params;
  const cards = await getListedBySet(setCode);
  if (cards.length === 0) return { title: "No Listings", robots: { index: false } };
  const name = (await getPokemonSets()).get(setCode)?.name ?? cards[0].setName ?? setCode;
  return {
    title: `${name} Cards For Sale & Trade`,
    description: `Buy, sell, and trade ${name} Pokémon cards on Vaultset. ${cards.length} card${cards.length !== 1 ? "s" : ""} currently listed with live market values.`,
    alternates: { canonical: `/marketplace/sets/${encodeURIComponent(setCode)}` },
  };
}

export default async function MarketplaceSetPage({ params }: { params: Promise<{ setCode: string }> }) {
  const { setCode } = await params;
  const cards = await getListedBySet(setCode);
  if (cards.length === 0) notFound();

  const name = (await getPokemonSets()).get(setCode)?.name ?? cards[0].setName ?? setCode;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Marketplace", item: "https://vaultset.app/marketplace" },
      { "@type": "ListItem", position: 2, name: `${name} for sale`, item: `https://vaultset.app/marketplace/sets/${encodeURIComponent(setCode)}` },
    ],
  };

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav className="text-sm text-foreground-muted">
        <Link href="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <div>
        <h1 className="text-3xl font-bold text-foreground">{name} Cards For Sale &amp; Trade</h1>
        <p className="mt-2 text-foreground-muted max-w-2xl">
          {cards.length} {name} card{cards.length !== 1 ? "s" : ""} listed by collectors on Vaultset,
          with live market values. Open a card to see all listings, prices, and grades —{" "}
          <Link href="/register" className="text-gold hover:text-gold-light transition-colors">create a free account</Link> or{" "}
          <Link href="/login" className="text-gold hover:text-gold-light transition-colors">sign in</Link> to buy or make an offer.
        </p>
        <p className="mt-2 text-sm">
          <Link href={`/sets/${encodeURIComponent(setCode)}`} className="text-gold hover:text-gold-light transition-colors">
            See the full {name} card list & values →
          </Link>
        </p>
      </div>

      <MarketplaceHubGrid cards={cards} />
    </div>
  );
}
