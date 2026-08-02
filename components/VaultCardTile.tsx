import Link from "next/link";
import Image from "next/image";
import { priceApiId } from "@/lib/pricing/cardIdentity";

// The card tile used by the Vault and Showcase tabs on a public profile. Both
// rendered the same markup inline and neither was clickable, so a visitor could
// see someone's collection but had no way into any individual card.

export type VaultTileCard = {
  id?: string | null;
  name?: string | null;
  set_name?: string | null;
  image_url?: string | null;
  game_data?: Record<string, unknown> | null;
};

export type VaultTileItem = {
  condition?: string | null;
  grader?: string | null;
  grade?: number | string | null;
  for_sale?: boolean | null;
  for_trade?: boolean | null;
};

/**
 * `/card-data/<id>` link for a card, or null when it can't be addressed.
 *
 * The route is keyed by the same identity the pricing cache uses — a
 * pokemontcg.io id, else `tcg:<productId>`, else `manual:<cardRowId>` — and
 * `resolveCards` there handles all three, so a hand-entered card resolves from
 * our own `cards` table rather than 404ing. Returns null only when the card row
 * has no id at all, in which case the tile renders unlinked instead of pointing
 * at a dead page.
 */
export function cardDataHref(card: VaultTileCard | null | undefined): string | null {
  if (!card) return null;
  const apiId = priceApiId((card.game_data ?? {}) as Record<string, unknown>, card.id ?? null);
  return apiId ? `/card-data/${encodeURIComponent(apiId)}` : null;
}

export function VaultCardTile({
  item,
  card,
  showAvailability = false,
  className = "",
}: {
  item: VaultTileItem;
  card: VaultTileCard | null;
  /** Show the $ / T corner flags (Vault tab only — the Showcase is curated, not for sale). */
  showAvailability?: boolean;
  className?: string;
}) {
  const href = cardDataHref(card);

  const body = (
    <>
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised">
        {card?.image_url ? (
          <Image
            src={card.image_url}
            alt={card.name ?? "Card"}
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
            className="object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-foreground-muted text-sm font-medium">
            {card?.name?.[0] ?? "?"}
          </div>
        )}
        {showAvailability && (item.for_sale || item.for_trade) && (
          <div className="absolute bottom-1 left-1 flex gap-0.5">
            {item.for_sale && (
              <span className="rounded-sm bg-emerald-500/80 px-1 py-0.5 text-[9px] font-semibold text-white leading-none">$</span>
            )}
            {item.for_trade && (
              <span className="rounded-sm bg-blue-500/80 px-1 py-0.5 text-[9px] font-semibold text-white leading-none">T</span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-foreground truncate leading-tight">{card?.name ?? "—"}</p>
        <p className="text-xs text-foreground-muted truncate">{card?.set_name ?? "—"}</p>
        {item.grader ? (
          <p className="text-xs text-gold">{item.grader} {item.grade}</p>
        ) : item.condition ? (
          <p className="text-xs text-foreground-muted capitalize">{item.condition.replace(/_/g, " ")}</p>
        ) : null}
      </div>
    </>
  );

  const base = `rounded-xl border border-border bg-surface p-2 flex flex-col gap-2 transition-colors ${className}`;

  if (!href) return <div className={base}>{body}</div>;

  return (
    <Link href={href} className={`${base} hover:border-gold/50 hover:bg-surface-raised`}>
      {body}
    </Link>
  );
}
