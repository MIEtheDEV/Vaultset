import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSetChecklist, getSetHubIndex, getListedBySet, distinctSetCardCodes } from "@/lib/hubs/hubQueries";
import { getPokemonSets } from "@/lib/sets/getPokemonSets";
import { splitSecretRares } from "@/lib/sets/setDisplay";
import { HubCardGrid } from "@/components/hubs/HubCardGrid";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await distinctSetCardCodes()).map((setCode) => ({ setCode }));
}

export async function generateMetadata({ params }: { params: Promise<{ setCode: string }> }): Promise<Metadata> {
  const { setCode } = await params;
  const [meta, hub] = await Promise.all([
    getPokemonSets().then((m) => m.get(setCode)),
    getSetHubIndex(),
  ]);
  const entry = hub.find((s) => s.setCode === setCode);
  const name = meta?.name ?? entry?.setName ?? setCode;
  if (!entry && !meta) return { title: "Set Not Found", robots: { index: false } };
  return {
    title: `${name} — Master Set Checklist, Card List & Prices`,
    description: `The complete ${name} checklist — every card and secret rare with live market values and prices by condition. Track your Complete Set and Master Set progress free on Vaultset.`,
    alternates: { canonical: `/sets/${encodeURIComponent(setCode)}` },
  };
}

export default async function SetDetailPage({ params }: { params: Promise<{ setCode: string }> }) {
  const { setCode } = await params;
  const [cards, meta, listed] = await Promise.all([
    getSetChecklist(setCode),
    getPokemonSets().then((m) => m.get(setCode)),
    getListedBySet(setCode),
  ]);
  if (cards.length === 0 && !meta) notFound();

  const name = meta?.name ?? cards[0]?.setName ?? setCode;
  const { regular, secret } = splitSecretRares(meta?.total ?? cards.length, meta?.printedTotal);
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Sets", item: "https://www.vaultset.app/sets" },
      { "@type": "ListItem", position: 2, name, item: `https://www.vaultset.app/sets/${encodeURIComponent(setCode)}` },
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
            {meta?.series ? `${meta.series} · ` : ""}
            {regular} card{regular !== 1 ? "s" : ""}{secret > 0 ? ` + ${secret} secret rare${secret !== 1 ? "s" : ""}` : ""}
            {meta?.releaseDate ? ` · released ${meta.releaseDate}` : ""}
          </p>
        </div>
      </div>

      <p className="text-foreground-muted max-w-2xl">
        The full {name} card list with live market values where available. Click any card for its
        price history, condition breakdown, graded prices, and marketplace availability.
      </p>

      {/* Master set checklist CTA */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">{name} Master Set Checklist</h2>
          <p className="text-sm text-foreground-muted mt-0.5">
            {regular} cards{secret > 0 ? ` + ${secret} secret rares` : ""} in the full set. Track which
            ones you own and complete your Complete Set and Master Set — free.
          </p>
        </div>
        <Link
          href={`/masterset/${encodeURIComponent(setCode)}`}
          className="shrink-0 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
        >
          Track my progress →
        </Link>
      </div>

      {listed.length > 0 && (
        <p className="text-sm">
          <Link href={`/marketplace/sets/${encodeURIComponent(setCode)}`} className="text-gold hover:text-gold-light transition-colors">
            {listed.length} {name} card{listed.length !== 1 ? "s" : ""}{" "}for sale &amp; trade →
          </Link>
        </p>
      )}

      <HubCardGrid cards={cards} />
    </div>
  );
}
