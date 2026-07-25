import type { ReactNode } from "react";
import Image from "next/image";
import { timeAgo } from "@/lib/timeAgo";

export interface RevealRow {
  id: string;
  card_name: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  rarity: string | null;
  notes: string | null;
  revealed_at: string;
}

/**
 * One reveal as a full-width block: a header (title / caption / identity / time)
 * over a responsive grid of every card in the group — 1 column on mobile, 3 on
 * tablet, up to 5 on desktop. `identity` is a @username link on the public feed,
 * a visibility badge on the user's own reveals.
 */
export function RevealGroupTile({ items, identity }: { items: RevealRow[]; identity: ReactNode }) {
  const primary = items[0];
  const count   = items.length;

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 border-b border-border bg-surface-raised">
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-sm">
            {count > 1 ? `${count}-card pull` : (primary.card_name ?? "")}
          </p>
          {primary.notes && (
            <p className="text-xs text-foreground-muted italic line-clamp-1">{primary.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground-muted flex-shrink-0">
          {identity}
          <span aria-hidden>·</span>
          <span>{timeAgo(primary.revealed_at)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 p-4">
        {items.map((card) => (
          <div key={card.id} className="space-y-2">
            <div className="relative aspect-[2.5/3.5] w-full rounded-lg overflow-hidden bg-surface-raised">
              {card.image_url ? (
                <Image
                  src={card.image_url}
                  alt={card.card_name ?? ""}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 20vw"
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                  </svg>
                </div>
              )}
            </div>
            <div>
              <p className="font-medium text-foreground text-sm leading-tight truncate">{card.card_name ?? ""}</p>
              <p className="text-xs text-foreground-muted truncate">
                {card.set_name ?? ""}
                {card.card_number ? ` · #${card.card_number}` : ""}
              </p>
              {card.rarity && (
                <p className="text-xs text-foreground-muted capitalize">{card.rarity.replace(/_/g, " ")}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Collapse rows sharing a `reveal_group_id` into one group, preserving fetch order. */
export function groupReveals<T extends { id: string; reveal_group_id?: string | null }>(
  rows: T[],
): { key: string; items: T[] }[] {
  const groups: { key: string; items: T[] }[] = [];
  const index = new Map<string, number>();
  for (const r of rows) {
    const key = r.reveal_group_id ?? r.id;
    const at = index.get(key);
    if (at === undefined) { index.set(key, groups.length); groups.push({ key, items: [r] }); }
    else groups[at].items.push(r);
  }
  return groups;
}
