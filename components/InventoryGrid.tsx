"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";

const raritySystem = new PokemonRaritySystem();
import { CardImage } from "@/components/CardImage";
import { RemoveCardButton } from "@/components/RemoveCardButton";
import { ListAtMarketButton } from "@/components/ListAtMarketButton";

const conditionLabel: Record<string, string> = {
  mint: "Mint",
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

const conditionColor: Record<string, string> = {
  mint: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  near_mint: "text-green-400 bg-green-400/10 border-green-400/20",
  lightly_played: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  moderately_played: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  heavily_played: "text-red-400 bg-red-400/10 border-red-400/20",
  damaged: "text-red-600 bg-red-600/10 border-red-600/20",
};

type FilterKey = "all" | "for_sale" | "for_trade" | "graded";
type SortKey   = "newest" | "oldest" | "name_asc" | "name_desc" | "rarity_high";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "for_sale",  label: "For Sale" },
  { key: "for_trade", label: "For Trade" },
  { key: "graded",    label: "Graded" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest",      label: "Date Added (newest)" },
  { key: "oldest",      label: "Date Added (oldest)" },
  { key: "name_asc",    label: "Name (A – Z)" },
  { key: "name_desc",   label: "Name (Z – A)" },
  { key: "rarity_high", label: "Rarity (highest first)" },
];


const finishLabel: Record<string, string> = {
  non_holo:         "Non-Holo",
  holofoil:         "Holofoil",
  reverse_holofoil: "Reverse Holofoil",
  textured_holofoil: "Textured Holofoil",
  gold_etched:      "Gold Etched",
};

export interface InventoryItem {
  id: string;
  condition: string | null;
  finish: string | null;
  quantity: number;
  paid_price: number | null;
  list_price: number | null;
  market_price: number | null;
  for_sale: boolean;
  for_trade: boolean;
  grader: string | null;
  grade: number | null;
  acquired_at: string | null;
  cards: {
    id: string;
    game: string;
    name: string;
    set_name: string;
    card_number: string | null;
    year: number | null;
    image_url: string | null;
    game_data: { is_promo?: boolean; [key: string]: unknown } | null;
  } | {
    id: string;
    game: string;
    name: string;
    set_name: string;
    card_number: string | null;
    year: number | null;
    image_url: string | null;
    game_data: { is_promo?: boolean; [key: string]: unknown } | null;
  }[] | null;
}

function resolveCard(item: InventoryItem) {
  return Array.isArray(item.cards) ? item.cards[0] : item.cards;
}

export function InventoryGrid({ items }: { items: InventoryItem[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort]     = useState<SortKey>("newest");

  const visible = useMemo(() => {
    let result = [...items];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((i) => {
        const card = resolveCard(i);
        if (!card) return false;
        return card.name.toLowerCase().includes(q);
      });
    }

    if (filter === "for_sale")  result = result.filter((i) => i.for_sale);
    if (filter === "for_trade") result = result.filter((i) => i.for_trade);
    if (filter === "graded")    result = result.filter((i) => !!i.grader);

    if (sort === "oldest")    result.reverse();
    if (sort === "name_asc")  result.sort((a, b) => (resolveCard(a)?.name ?? "").localeCompare(resolveCard(b)?.name ?? ""));
    if (sort === "name_desc") result.sort((a, b) => (resolveCard(b)?.name ?? "").localeCompare(resolveCard(a)?.name ?? ""));
    if (sort === "rarity_high") result.sort((a, b) => {
      const ra = (resolveCard(a)?.game_data as Record<string, unknown> | null)?.rarity as string ?? "";
      const rb = (resolveCard(b)?.game_data as Record<string, unknown> | null)?.rarity as string ?? "";
      return raritySystem.getSortOrder(ra) - raritySystem.getSortOrder(rb);
    });

    return result;
  }, [items, filter, sort, search]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-24 text-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised text-foreground-muted">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-foreground">Your vault is empty</p>
          <p className="mt-1 text-sm text-foreground-muted">Add cards manually to start tracking your collection.</p>
        </div>
        <Link
          href="/inventory/add"
          className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
        >
          Add your first card
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="space-y-3">

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by card name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface-raised pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Filters + Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === key
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
          >
            {SORTS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* No results under active filter */}
      {visible.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center space-y-3">
          <p className="text-sm text-foreground-muted">
            {search.trim() ? `No cards found for "${search.trim()}".` : "No cards match this filter."}
          </p>
          <div className="flex items-center justify-center gap-4">
            {search.trim() && (
              <button type="button" onClick={() => setSearch("")} className="text-xs text-gold hover:text-gold-light transition-colors">
                Clear search
              </button>
            )}
            {filter !== "all" && (
              <button type="button" onClick={() => setFilter("all")} className="text-xs text-gold hover:text-gold-light transition-colors">
                Clear filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* Card grid */}
      {visible.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map((item) => {
            const card = resolveCard(item);
            if (!card) return null;
            const condKey = item.condition ?? "";

            return (
              <div
                key={item.id}
                className="group rounded-2xl border border-border bg-surface hover:border-gold/30 hover:bg-surface-raised transition-all duration-200"
              >
                {/* Card image */}
                <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-t-2xl bg-surface-raised">
                  {card.image_url ? (
                    <CardImage src={card.image_url} alt={card.name} />
                  ) : card.game_data?.is_promo ? (
                    <div className="absolute inset-0 overflow-hidden">
                      <Image
                        src="/img/promo.png"
                        alt="Promo Card"
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-contain"
                        style={{ padding: "4rem 3rem" }}
                      />
                      <div className="absolute top-12 bottom-12 left-6 right-6 rounded-xl border border-gold/40 pointer-events-none shadow-[0_0_12px_rgba(232,184,75,0.15)]" />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <path d="M8 21h8M12 17v4" />
                      </svg>
                    </div>
                  )}
                  <span className="absolute top-2 left-2 rounded-full bg-background/80 backdrop-blur-sm px-2 py-0.5 text-xs font-medium text-foreground-muted capitalize">
                    {card.game}
                  </span>
                  <div className="absolute top-2 right-2 flex flex-row gap-1">
                    {item.for_sale && (
                      <span className="rounded-full bg-gold/90 px-2 py-0.5 text-xs font-semibold text-background">Sale</span>
                    )}
                    {item.for_trade && (
                      <span className="rounded-full bg-blue-400/90 px-2 py-0.5 text-xs font-semibold text-background">Trade</span>
                    )}
                  </div>
                </div>

                {/* Card info */}
                <div className="p-4 space-y-2">
                  <div>
                    <p className="font-semibold text-foreground leading-tight">{card.name}</p>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      {card.set_name}{card.card_number ? ` · ${card.card_number}` : ""}{card.year ? ` · ${card.year}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 flex-wrap">
                      {item.grader ? (
                        <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                          {item.grader} {item.grade}
                        </span>
                      ) : condKey ? (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${conditionColor[condKey] ?? "text-foreground-muted"}`}>
                          {conditionLabel[condKey] ?? condKey}
                        </span>
                      ) : null}
                      {item.finish && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted">
                          {finishLabel[item.finish] ?? item.finish}
                        </span>
                      )}
                      {card.game_data?.is_promo && (
                        <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">Promo</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.quantity > 1 && (
                        <span className="text-xs text-foreground-muted">×{item.quantity}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    {item.market_price != null ? (
                      <span className="text-xs text-foreground-muted">
                        Mkt <span className="font-medium text-foreground">${item.market_price.toFixed(2)}</span>
                      </span>
                    ) : (
                      <span />
                    )}
                    {item.for_sale && item.list_price != null && (
                      <span className="text-sm font-semibold text-gold">
                        ${item.list_price.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {item.market_price != null && (
                    <ListAtMarketButton
                      itemId={item.id}
                      marketPrice={item.market_price}
                      listPrice={item.list_price}
                      forSale={item.for_sale}
                    />
                  )}

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/inventory/${item.id}/edit`}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
                    >
                      Edit
                    </Link>
                    <RemoveCardButton itemId={item.id} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
