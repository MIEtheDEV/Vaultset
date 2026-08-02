import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSpeciesCards, topSpecies } from "@/lib/hubs/hubQueries";
import Link from "next/link";
import { HubCardGrid } from "@/components/hubs/HubCardGrid";
import { ChaseCards } from "@/components/hubs/ChaseCards";
import { HubFaq } from "@/components/hubs/HubFaq";
import { speciesName } from "@/lib/cards/species";
import { cardLabel, formatUsd, joinList, mostValuable, speciesSpan } from "@/lib/hubs/hubFacts";

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
  const { firstYear, lastYear, setCount } = speciesSpan(cards);
  const topCard = mostValuable(cards);
  // `cards` is already newest-set-first (byReleaseDesc), so the leading distinct
  // set names are the most recent expansions this species appeared in.
  const recentSets = [...new Set(cards.map((c) => c.setName).filter(Boolean))].slice(0, 3);
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
        <div className="mt-3 space-y-3 text-foreground-muted max-w-2xl leading-relaxed">
          <p>
            {display} has appeared on {cards.length} different{" "}
            {cards.length === 1 ? "card" : "cards"} in the Pokémon Trading Card Game
            {setCount > 1 ? `, spread across ${setCount} sets` : ""}
            {firstYear != null && lastYear != null && firstYear !== lastYear
              ? `, printed between ${firstYear} and ${lastYear}`
              : firstYear != null
                ? `, first printed in ${firstYear}`
                : ""}
            . Every one of them is listed below, newest set first.
          </p>
          <p>
            Each card shows its set, collector number, rarity, and current market value where we
            have pricing for it. Click any card to see how its price has moved over time, what it
            sells for in each condition from near mint down to damaged, graded values for PSA,
            BGS, and CGC slabs, and whether another collector has one listed right now.
          </p>
        </div>
      </div>
      <ChaseCards
        cards={cards}
        subtitle={`The rarest ${display} cards ever printed`}
        showSet
      />
      <HubCardGrid cards={cards} showSet />

      <HubFaq
        heading={`${display} Cards — Frequently Asked Questions`}
        items={[
          {
            q: `How many ${display} cards are there?`,
            a: (
              <>
                There are {cards.length} distinct {display}{" "}
                {cards.length === 1 ? "card" : "cards"} in the Pokémon Trading Card Game
                {setCount > 1 ? ` across ${setCount} different sets` : ""}
                {firstYear != null && lastYear != null && firstYear !== lastYear
                  ? `, printed between ${firstYear} and ${lastYear}`
                  : ""}
                . That count is by card number — collecting every printing, including reverse
                holos and alternate finishes, means considerably more cards than that.
              </>
            ),
          },
          ...(topCard?.value != null
            ? [
                {
                  q: `What is the most valuable ${display} card?`,
                  a: (
                    <>
                      Of the {display} cards we currently have pricing for, {cardLabel(topCard)}{" "}
                      from {topCard.setName} is the highest at {formatUsd(topCard.value)} for a
                      near-mint raw copy. Graded copies typically sell well above that, and older
                      holos in high grades command the biggest premiums.
                    </>
                  ),
                },
              ]
            : []),
          ...(recentSets.length
            ? [
                {
                  q: `Which sets have ${display} cards?`,
                  a: (
                    <>
                      The most recent {recentSets.length === 1 ? "set" : "sets"} featuring{" "}
                      {display} {recentSets.length === 1 ? "is" : "are"} {joinList(recentSets)}
                      {setCount > recentSets.length
                        ? `, and it appears in ${setCount - recentSets.length} other ${
                            setCount - recentSets.length === 1 ? "set" : "sets"
                          } listed below`
                        : ""}
                      . Each card in the grid is labelled with the set it came from.
                    </>
                  ),
                },
              ]
            : []),
          {
            q: `How do I track which ${display} cards I own?`,
            a: (
              <>
                Add them to your Vaultset collection and the app tracks condition, finish,
                quantity, and what you paid, then values the whole collection against live market
                prices. It is free — you can{" "}
                <Link href="/register" className="text-gold hover:text-gold-light transition-colors">
                  create an account
                </Link>{" "}
                and start adding cards in a couple of minutes.
              </>
            ),
          },
          {
            q: `Where can I buy or trade ${display} cards?`,
            a: (
              <>
                Vaultset runs a collector marketplace with no fees and no middleman. You can{" "}
                <Link href="/marketplace" className="text-gold hover:text-gold-light transition-colors">
                  browse cards listed for sale and trade
                </Link>
                , send cash or trade offers straight to other collectors, and add any {display}{" "}
                card to a wishlist so you get alerted the moment one is listed.
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
