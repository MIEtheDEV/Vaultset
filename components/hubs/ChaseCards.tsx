import Link from "next/link";
import Image from "next/image";
import { getRaritySystem } from "@/lib/rarity";
import { RaritySymbol } from "@/components/RaritySymbol";
import type { CatalogCard } from "@/lib/hubs/hubQueries";

const raritySystem = getRaritySystem("pokemon");
const RARE_SORT = raritySystem.getSortOrder("rare");
const CHASE_LIMIT = 12;

// A set's "chase cards" / hits: its rarest, most sought-after cards. We keep
// anything strictly rarer than a plain "Rare" — that captures the genuine pulls
// (illustration/secret/hyper/ultra rares, full arts, etc.) across both modern
// (S&V) and legacy sets — rank rarest-first with market value as the tiebreak,
// and cap the list so the strip stays a curated highlight, not a second grid.
// Rarity is the game's own signal for a "hit", so this needs no extra price fetch.
export function selectChaseCards(cards: CatalogCard[]): CatalogCard[] {
  return cards
    .filter((c) => c.rarity != null && raritySystem.getSortOrder(c.rarity) < RARE_SORT)
    .sort((a, b) => {
      const diff = raritySystem.getSortOrder(a.rarity!) - raritySystem.getSortOrder(b.rarity!);
      if (diff !== 0) return diff;
      return (b.value ?? -1) - (a.value ?? -1);
    })
    .slice(0, CHASE_LIMIT);
}

export function ChaseCards({ cards }: { cards: CatalogCard[] }) {
  const chase = selectChaseCards(cards);
  if (chase.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">Chase Cards</h2>
        <span className="text-sm text-foreground-muted">The set&apos;s most sought-after pulls</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin]">
        {chase.map((c) => (
          <ChaseTile key={c.apiId} card={c} />
        ))}
      </div>
    </section>
  );
}

function ChaseTile({ card }: { card: CatalogCard }) {
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
        <p className="text-[11px] text-foreground-muted truncate">
          {card.number ? `#${card.number}` : ""}
          {label ? <span className="text-gold/90">{card.number ? " · " : ""}{label}</span> : null}
        </p>
      </div>
    </Link>
  );
}
