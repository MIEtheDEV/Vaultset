import Link from "next/link";
import Image from "next/image";
import { getRaritySystem } from "@/lib/rarity";
import { RaritySymbol } from "@/components/RaritySymbol";
import type { CatalogCard } from "@/lib/hubs/hubQueries";
import { selectChaseCards as rankChaseCards } from "@/lib/sets/chaseCards";

const raritySystem = getRaritySystem("pokemon");

/** A set's hits, ranked by market value where the set is priced (see
 *  lib/sets/chaseCards — shared with the master-set strip). */
export function selectChaseCards(cards: CatalogCard[]): CatalogCard[] {
  return rankChaseCards(cards, (c) => ({
    rarity: c.rarity,
    value: c.value,
    number: c.number,
    key: c.apiId,
  }));
}

export function ChaseCards({
  cards,
  subtitle = "The set's most sought-after pulls",
  showSet = false,
}: {
  cards: CatalogCard[];
  /** Overridden on the species hubs, where the strip spans many sets. */
  subtitle?: string;
  /** Show each card's set name — needed when the strip isn't scoped to one set. */
  showSet?: boolean;
}) {
  const chase = selectChaseCards(cards);
  if (chase.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">Chase Cards</h2>
        <span className="text-sm text-foreground-muted">{subtitle}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin]">
        {chase.map((c) => (
          <ChaseTile key={c.apiId} card={c} showSet={showSet} />
        ))}
      </div>
    </section>
  );
}

function ChaseTile({ card, showSet = false }: { card: CatalogCard; showSet?: boolean }) {
  const label = card.rarity ? raritySystem.getDisplayLabel(card.rarity) : null;

  return (
    <Link
      href={`/card-data/${encodeURIComponent(card.apiId)}`}
      className="group w-[140px] shrink-0 rounded-2xl border border-border bg-surface overflow-hidden hover:border-gold/30 hover:bg-surface-raised transition-colors"
    >
      <div className="relative aspect-[2.5/3.5] w-full bg-surface-raised">
        {card.image ? (
          <Image src={card.image} alt={card.name} fill sizes="150px" className="object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-foreground-muted">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          </div>
        )}
        {card.rarity && (
          <div className="absolute top-1.5 left-1.5 rounded-full bg-background/80 backdrop-blur-sm px-1.5 py-1 shadow" title={label ?? undefined}>
            <RaritySymbol rarity={card.rarity} title={label ?? undefined} className="text-base" />
          </div>
        )}
      </div>
      <div className="p-2.5 space-y-0.5">
        <p className="text-xs font-medium text-foreground truncate group-hover:text-gold transition-colors">{card.name}</p>
        {showSet && card.setName ? (
          <p className="text-[11px] text-foreground-muted truncate">{card.setName}</p>
        ) : null}
        <p className="text-[11px] text-foreground-muted truncate">
          {card.number ? `#${card.number}` : ""}
          {label ? <span className="text-gold/90">{card.number ? " · " : ""}{label}</span> : null}
        </p>
        {/* The strip is ranked by this where the set is priced — show it, or the
            order looks arbitrary next to the rarity badge. */}
        {card.value != null && (
          <p className="text-xs font-semibold text-gold">${Number(card.value).toFixed(2)}</p>
        )}
      </div>
    </Link>
  );
}
