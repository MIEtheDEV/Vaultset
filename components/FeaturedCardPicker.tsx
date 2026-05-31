"use client";

import { useState } from "react";

export interface PickerItem {
  id: string;
  cards: {
    name: string;
    set_name: string;
    card_number: string | null;
    image_url: string | null;
  } | null;
}

export function FeaturedCardPicker({
  value,
  onChange,
  items,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  items: PickerItem[];
}) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch]   = useState("");

  const featured = items.find((i) => i.id === value) ?? null;

  const filtered = search.trim()
    ? items.filter((i) =>
        i.cards?.name.toLowerCase().includes(search.toLowerCase()) ||
        i.cards?.set_name.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  function stopPicking() {
    setPicking(false);
    setSearch("");
  }

  return (
    <div className="space-y-3">
      {!picking && (
        <>
          {featured?.cards ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3">
              <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-surface">
                {featured.cards.image_url ? (
                  <img
                    src={featured.cards.image_url}
                    alt={featured.cards.name}
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{featured.cards.name}</p>
                <p className="text-xs text-foreground-muted truncate">
                  {featured.cards.set_name}
                  {featured.cards.card_number ? ` · ${featured.cards.card_number}` : ""}
                </p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="text-xs text-gold hover:text-gold-light transition-colors"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors text-center"
            >
              + Choose a card to feature
            </button>
          )}
        </>
      )}

      {picking && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search your collection…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
            />
            <button
              type="button"
              onClick={stopPicking}
              className="text-sm text-foreground-muted hover:text-foreground transition-colors flex-shrink-0"
            >
              Cancel
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-foreground-muted">No cards match your search.</p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 max-h-60 overflow-y-auto pr-1">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.cards?.name ?? ""}
                  onClick={() => { onChange(item.id); stopPicking(); }}
                  className={`rounded-lg border p-1 transition-all ${
                    value === item.id
                      ? "border-gold bg-gold/10 ring-1 ring-gold/40"
                      : "border-border hover:border-gold/40"
                  }`}
                >
                  {item.cards?.image_url ? (
                    <img
                      src={item.cards.image_url}
                      alt={item.cards.name ?? ""}
                      className="w-full rounded aspect-[2/3] object-contain"
                    />
                  ) : (
                    <div className="aspect-[2/3] rounded bg-surface-raised flex items-center justify-center text-xs text-foreground-muted">
                      {item.cards?.name?.[0] ?? "?"}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
