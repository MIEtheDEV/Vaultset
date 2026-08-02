import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSetChecklist, getSetHubIndex, getListedBySet, distinctSetCardCodes } from "@/lib/hubs/hubQueries";
import { getPokemonSets } from "@/lib/sets/getPokemonSets";
import { splitSecretRares } from "@/lib/sets/setDisplay";
import { HubCardGrid } from "@/components/hubs/HubCardGrid";
import { ChaseCards } from "@/components/hubs/ChaseCards";
import { HubFaq } from "@/components/hubs/HubFaq";
import { cardLabel, formatReleaseMonth, formatUsd, mostValuable } from "@/lib/hubs/hubFacts";

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
  const released = formatReleaseMonth(meta?.releaseDate ?? cards[0]?.releaseDate);
  const topCard = mostValuable(cards);
  const totalCards = regular + secret;
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

      <div className="space-y-3 text-foreground-muted max-w-2xl leading-relaxed">
        <p>
          {name} is a Pokémon Trading Card Game expansion
          {meta?.series ? ` from the ${meta.series} series` : ""}
          {released ? `, released in ${released}` : ""}. The set contains {regular}{" "}
          {regular === 1 ? "card" : "cards"} in the main numbering
          {secret > 0 ? (
            <> plus {secret} secret {secret === 1 ? "rare" : "rares"} printed beyond the
              official set total, for {totalCards} cards in all</>
          ) : null}
          .
        </p>
        <p>
          Below is the complete {name} checklist in collector-number order, with the current
          market value of each card where we have pricing for it. Click any card to see its full
          price history, what it sells for by condition, graded values for PSA, BGS, and CGC
          slabs, and whether another collector currently has one listed. You can tick cards off
          as you go and track both your Complete Set and your Master Set for free.
        </p>
      </div>

      <ChaseCards cards={cards} />

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

      <HubFaq
        heading={`${name} — Frequently Asked Questions`}
        items={[
          {
            q: `How many cards are in the ${name} set?`,
            a: (
              <>
                There are {regular} {regular === 1 ? "card" : "cards"} in the main {name}{" "}
                numbering
                {secret > 0
                  ? `, plus ${secret} secret ${secret === 1 ? "rare" : "rares"} numbered above the printed set total — ${totalCards} cards in total`
                  : ""}
                . A Master Set is larger still, because it counts every finish of every card
                (reverse holos, promos, and alternate printings) rather than one copy of each
                card number.
              </>
            ),
          },
          ...(topCard?.value != null
            ? [
                {
                  q: `What is the most valuable ${name} card?`,
                  a: (
                    <>
                      Of the {name} cards we currently have pricing for, {cardLabel(topCard)} is
                      the highest at {formatUsd(topCard.value)} for a near-mint raw copy. Graded
                      copies sell for considerably more, and values move with the market — open
                      the card to see its recent price history before you buy or sell.
                    </>
                  ),
                },
              ]
            : []),
          {
            q: "What is the difference between a Complete Set and a Master Set?",
            a: (
              <>
                A Complete Set means one copy of every card number in the expansion. A Master Set
                means every printed variation of every card — including reverse holos, holo and
                non-holo versions of the same card, and set-specific promos. Master Sets are
                significantly harder and more expensive to finish. Vaultset tracks{" "}
                <Link href={`/masterset/${encodeURIComponent(setCode)}`} className="text-gold hover:text-gold-light transition-colors">
                  your {name} progress
                </Link>{" "}
                against both targets at the same time.
              </>
            ),
          },
          {
            q: `How are ${name} card prices calculated?`,
            a: (
              <>
                Prices shown here are market values — what copies have actually been selling for
                recently, not what sellers are asking. We pull live data for raw cards by
                condition and, for slabs, real sold medians by grading company. Cards with no
                recent sales data show no price rather than a guess.
              </>
            ),
          },
          {
            q: `Where can I buy, sell, or trade ${name} cards?`,
            a: (
              <>
                Vaultset has a collector marketplace with no fees and no middleman. You can{" "}
                <Link href={`/marketplace/sets/${encodeURIComponent(setCode)}`} className="text-gold hover:text-gold-light transition-colors">
                  browse {name} cards listed for sale and trade
                </Link>
                , send cash or trade offers directly to other collectors, and build a wishlist
                that alerts you when a card you want gets listed.
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
