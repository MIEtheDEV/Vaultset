import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSetCards, getListedBySet, distinctSetCodes } from "@/lib/hubs/hubQueries";
import { getPokemonSets } from "@/lib/sets/getPokemonSets";
import { HubCardGrid } from "@/components/hubs/HubCardGrid";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await distinctSetCodes()).map((setCode) => ({ setCode }));
}

export async function generateMetadata({ params }: { params: Promise<{ setCode: string }> }): Promise<Metadata> {
  const { setCode } = await params;
  const meta = (await getPokemonSets()).get(setCode);
  const cards = await getSetCards(setCode);
  const name = meta?.name ?? cards[0]?.setName ?? setCode;
  if (cards.length === 0 && !meta) return { title: "Set Not Found", robots: { index: false } };
  return {
    title: `${name} — Card List, Prices & Values`,
    description: `Every card in ${name} with live market values, prices by condition, and graded prices. ${cards.length} cards tracked on Vaultset.`,
    alternates: { canonical: `/sets/${encodeURIComponent(setCode)}` },
  };
}

export default async function SetDetailPage({ params }: { params: Promise<{ setCode: string }> }) {
  const { setCode } = await params;
  const [cards, meta, listed] = await Promise.all([
    getSetCards(setCode),
    getPokemonSets().then((m) => m.get(setCode)),
    getListedBySet(setCode),
  ]);
  if (cards.length === 0 && !meta) notFound();

  const name = meta?.name ?? cards[0]?.setName ?? setCode;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Sets", item: "https://vaultset.app/sets" },
      { "@type": "ListItem", position: 2, name, item: `https://vaultset.app/sets/${encodeURIComponent(setCode)}` },
    ],
  };

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav className="text-sm text-foreground-muted">
        <Link href="/sets" className="hover:text-foreground transition-colors">Sets</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <div className="flex items-center gap-4">
        {meta?.images?.logo && (
          <div className="relative h-14 w-24 shrink-0">
            <Image src={meta.images.logo} alt={name} fill sizes="96px" className="object-contain" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-foreground">{name}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {meta?.series ? `${meta.series} · ` : ""}{cards.length} card{cards.length !== 1 ? "s" : ""} tracked
            {meta?.printedTotal ? ` · ${meta.printedTotal} in set` : ""}
            {meta?.releaseDate ? ` · released ${meta.releaseDate}` : ""}
          </p>
        </div>
      </div>

      <p className="text-foreground-muted max-w-2xl">
        Live market values for every {name} card tracked on Vaultset. Click any card for its full
        price history, condition breakdown, graded prices, and marketplace availability.
      </p>

      {listed.length > 0 && (
        <p className="text-sm">
          <Link href={`/marketplace/sets/${encodeURIComponent(setCode)}`} className="text-gold hover:text-gold-light transition-colors">
            {listed.length} {name} card{listed.length !== 1 ? "s" : ""} for sale &amp; trade →
          </Link>
        </p>
      )}

      <HubCardGrid cards={cards} />
    </div>
  );
}
