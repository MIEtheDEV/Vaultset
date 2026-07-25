"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

export interface RevealInventoryCard {
  collectionItemId: string;
  cardId: string | null;
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl: string;
  rarity: string;
}

interface RowCard {
  id: string;
  name: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  game_data: Record<string, unknown> | null;
}

interface Row {
  id: string;
  product_purchase_id: string | null;
  cards: RowCard | RowCard[] | null;
}

/**
 * Lets the user pick a card they already own instead of searching the catalog.
 * Emits a normalized shape that also carries `collectionItemId` / `cardId` so
 * the reveal can be linked back to the inventory item.
 */
export function RevealInventoryPicker({
  productId,
  selectedIds,
  onToggle,
}: {
  productId?: string | null;
  selectedIds: Set<string>;
  onToggle: (card: RevealInventoryCard) => void;
}) {
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [query, setQuery]     = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Sign in to see your inventory."); setLoading(false); return; }

      const { data, error: qErr } = await supabase
        .from("collection_items")
        .select(`
          id, product_purchase_id,
          cards ( id, name, set_name, card_number, image_url, game_data )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (qErr) { setError(qErr.message); setLoading(false); return; }
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const items = useMemo<RevealInventoryCard[]>(() => {
    const normalized: RevealInventoryCard[] = [];
    // Cards already linked to this product go first so they're easy to find.
    const sorted = [...rows].sort((a, b) =>
      Number(!!productId && b.product_purchase_id === productId) -
      Number(!!productId && a.product_purchase_id === productId));

    for (const row of sorted) {
      const c = Array.isArray(row.cards) ? row.cards[0] : row.cards;
      if (!c || !c.name) continue;
      normalized.push({
        collectionItemId: row.id,
        cardId:           c.id ?? null,
        name:             c.name,
        setName:          c.set_name ?? "",
        cardNumber:       c.card_number ?? "",
        imageUrl:         c.image_url ?? "",
        rarity:           (c.game_data?.rarity as string | undefined) ?? "",
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.setName.toLowerCase().includes(q) ||
      c.cardNumber.toLowerCase().includes(q));
  }, [rows, query, productId]);

  if (loading) {
    return <p className="text-sm text-foreground-muted">Loading your inventory…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No cards in your inventory yet. Use search instead, or add cards from the inventory page.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter your cards by name, set, or number…"
        className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none"
      />
      {items.length === 0 ? (
        <p className="text-sm text-foreground-muted">No cards match “{query}”.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {items.map((card) => {
            const selected = selectedIds.has(card.collectionItemId);
            return (
              <li key={card.collectionItemId}>
                <button
                  type="button"
                  onClick={() => onToggle(card)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    selected ? "bg-gold/10" : "hover:bg-surface-raised"
                  }`}
                >
                  <div className="relative w-9 h-12 flex-shrink-0 rounded overflow-hidden bg-surface-raised">
                    {card.imageUrl && (
                      <Image src={card.imageUrl} alt={card.name} fill sizes="36px" className="object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{card.name}</p>
                    <p className="truncate text-xs text-foreground-muted">
                      {card.setName}{card.cardNumber ? ` · #${card.cardNumber}` : ""}
                    </p>
                  </div>
                  <span
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                      selected ? "border-gold bg-gold text-background" : "border-border text-transparent"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
