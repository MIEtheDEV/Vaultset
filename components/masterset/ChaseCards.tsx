import Link from "next/link";
import Image from "next/image";
import { getRaritySystem } from "@/lib/rarity";
import { RaritySymbol } from "@/components/RaritySymbol";
import type { CardStatus } from "@/lib/sets/masterset";

const raritySystem = getRaritySystem("pokemon");

// The set's chase cards / hits on the master-set progress page — its rarest, most
// sought-after cards, with the viewer's ownership overlaid (owned cards in full
// colour + check; needed cards dimmed). Selection + ranking live server-side
// (lib/sets/masterset.selectChaseCards); this is the presentation only.
export function ChaseCards({ cards }: { cards: CardStatus[] }) {
  if (cards.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">Chase Cards</h2>
        <span className="text-sm text-foreground-muted">The set&apos;s most sought-after pulls</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin]">
        {cards.map((c) => (
          <ChaseTile key={`${c.card_number}-${c.pokemon_api_id ?? c.name}`} card={c} />
        ))}
      </div>
    </section>
  );
}

function ChaseTile({ card }: { card: CardStatus }) {
  const owned = card.ownedComplete;
  const label = card.rarity ? raritySystem.getDisplayLabel(card.rarity) : null;

  const inner = (
    <>
      <div className="relative aspect-[2.5/3.5] w-full bg-surface-raised">
        {card.image_url ? (
          <Image
            src={card.image_url}
            alt={card.name}
            fill
            sizes="150px"
            className={`object-contain transition-all duration-300 ${owned ? "" : "opacity-45 grayscale group-hover:opacity-70"}`}
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center text-foreground-muted ${owned ? "" : "opacity-45"}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          </div>
        )}
        {card.rarity && (
          <div className="absolute top-1.5 left-1.5 rounded-full bg-background/80 backdrop-blur-sm px-1.5 py-1 shadow" title={label ?? undefined}>
            <RaritySymbol rarity={card.rarity} title={label ?? undefined} className="text-base" />
          </div>
        )}
        {owned && (
          <div className="absolute top-1.5 right-1.5 rounded-full bg-gold text-background w-5 h-5 flex items-center justify-center shadow" title="In your collection">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
        )}
      </div>
      <div className="p-2.5 space-y-0.5">
        <p className={`text-xs font-medium truncate ${owned ? "text-foreground" : "text-foreground-muted"}`}>{card.name}</p>
        <p className="text-[11px] text-foreground-muted truncate">
          #{card.card_number}
          {label ? <span className="text-gold/90"> · {label}</span> : null}
        </p>
      </div>
    </>
  );

  const className =
    "group w-[140px] shrink-0 rounded-2xl border border-border bg-surface overflow-hidden hover:border-gold/30 hover:bg-surface-raised transition-colors";

  // Link native pokemontcg.io cards to their data page; others are static tiles.
  return card.pokemon_api_id ? (
    <Link href={`/card-data/${encodeURIComponent(card.pokemon_api_id)}`} className={className}>{inner}</Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
