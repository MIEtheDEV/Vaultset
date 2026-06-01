"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { CardImage } from "@/components/CardImage";
import { createClient } from "@/utils/supabase/client";

const conditionLabel: Record<string, string> = {
  mint: "Mint", near_mint: "NM", lightly_played: "LP",
  moderately_played: "MP", heavily_played: "HP", damaged: "DMG",
};
const conditionColor: Record<string, string> = {
  mint: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  near_mint: "text-green-400 bg-green-400/10 border-green-400/20",
  lightly_played: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  moderately_played: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  heavily_played: "text-red-400 bg-red-400/10 border-red-400/20",
  damaged: "text-red-600 bg-red-600/10 border-red-600/20",
};
const finishLabel: Record<string, string> = {
  non_holo: "Non-Holo", holofoil: "Holofoil", reverse_holofoil: "Reverse Holofoil",
  textured_holofoil: "Textured Holofoil", gold_etched: "Gold Etched",
};

type FilterKey = "all" | "for_sale" | "for_trade" | "graded" | "wanted" | "following";
type SortKey   = "newest" | "price_asc" | "price_desc" | "name_asc";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "for_sale",  label: "For Sale" },
  { key: "for_trade", label: "For Trade" },
  { key: "graded",    label: "Graded" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest",     label: "Recently Listed" },
  { key: "price_asc",  label: "Price (low – high)" },
  { key: "price_desc", label: "Price (high – low)" },
  { key: "name_asc",   label: "Name (A – Z)" },
];

export interface MarketplaceListing {
  id: string;
  user_id: string;
  seller_username: string;
  condition: string | null;
  finish: string | null;
  for_sale: boolean;
  for_trade: boolean;
  list_price: number | null;
  grader: string | null;
  grade: number | null;
  quantity: number;
  created_at: string;
  cards: {
    id: string;
    game: string;
    name: string;
    set_name: string;
    card_number: string | null;
    year: number | null;
    image_url: string | null;
    game_data: Record<string, unknown> | null;
  } | {
    id: string;
    game: string;
    name: string;
    set_name: string;
    card_number: string | null;
    year: number | null;
    image_url: string | null;
    game_data: Record<string, unknown> | null;
  }[] | null;
}

function resolveCard(item: MarketplaceListing) {
  return Array.isArray(item.cards) ? item.cards[0] : item.cards;
}

function getCardApiId(item: MarketplaceListing): string {
  return ((resolveCard(item)?.game_data as Record<string, unknown>)?.pokemon_api_id as string) ?? "";
}

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

const VALID_FILTERS = new Set<FilterKey>(["all", "for_sale", "for_trade", "graded", "wanted", "following"]);

export function MarketplaceGrid({
  listings,
  currentUserId,
  initialWatchedIds = [],
  wishedApiIds = [],
  followingUserIds = [],
  sellerFollowerCounts = {},
  initialFilter,
}: {
  listings: MarketplaceListing[];
  currentUserId: string;
  initialWatchedIds?: string[];
  wishedApiIds?: string[];
  followingUserIds?: string[];
  sellerFollowerCounts?: Record<string, number>;
  initialFilter?: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>(
    VALID_FILTERS.has(initialFilter as FilterKey) ? (initialFilter as FilterKey) : "all"
  );
  const [sort, setSort]     = useState<SortKey>("newest");
  const [watchedIds, setWatchedIds] = useState<Set<string>>(() => new Set(initialWatchedIds));

  const wishedApiSet    = useMemo(() => new Set(wishedApiIds),    [wishedApiIds]);
  const followingUserSet = useMemo(() => new Set(followingUserIds), [followingUserIds]);

  async function toggleWatch(itemId: string) {
    const isWatched = watchedIds.has(itemId);

    // Optimistic update
    setWatchedIds((prev) => {
      const next = new Set(prev);
      if (isWatched) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

    const supabase = createClient();
    if (isWatched) {
      await supabase.from("watchlist").delete().eq("user_id", currentUserId).eq("item_id", itemId);
    } else {
      await supabase.from("watchlist").insert({ user_id: currentUserId, item_id: itemId });
    }
  }

  const visible = useMemo(() => {
    let result = [...listings];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((i) => resolveCard(i)?.name.toLowerCase().includes(q));
    }

    if (filter === "for_sale")  result = result.filter((i) => i.for_sale);
    if (filter === "for_trade") result = result.filter((i) => i.for_trade);
    if (filter === "graded")    result = result.filter((i) => !!i.grader);
    if (filter === "wanted")    result = result.filter((i) => wishedApiSet.has(getCardApiId(i)));
    if (filter === "following") result = result.filter((i) => followingUserSet.has(i.user_id));

    if (sort === "price_asc")  result.sort((a, b) => (a.list_price ?? Infinity) - (b.list_price ?? Infinity));
    if (sort === "price_desc") result.sort((a, b) => (b.list_price ?? -Infinity) - (a.list_price ?? -Infinity));
    if (sort === "name_asc")   result.sort((a, b) => (resolveCard(a)?.name ?? "").localeCompare(resolveCard(b)?.name ?? ""));

    // Float wishlist matches to top when browsing "all" by newest
    if (filter !== "wanted" && sort === "newest" && wishedApiSet.size > 0) {
      result.sort((a, b) => {
        const aWanted = wishedApiSet.has(getCardApiId(a));
        const bWanted = wishedApiSet.has(getCardApiId(b));
        if (aWanted && !bWanted) return -1;
        if (!aWanted && bWanted) return 1;
        return 0;
      });
    }

    return result;
  }, [listings, search, filter, sort, wishedApiSet]);

  const myListings = listings.filter((l) => l.user_id === currentUserId);

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-24 text-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised text-foreground-muted">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <circle cx="7" cy="7" r="1" fill="currentColor" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-foreground">No listings yet</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Cards listed for sale or trade will appear here.
          </p>
        </div>
        <Link href="/inventory" className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors">
          Go to Inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* My Listings */}
      {myListings.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Your Listings</h2>
            <span className="text-xs text-foreground-muted">{myListings.length} active</span>
          </div>
          <div className="p-4 flex gap-3 overflow-x-auto pb-4">
            {myListings.map((item) => {
              const card = resolveCard(item);
              if (!card) return null;
              return (
                <div key={item.id} className="flex-shrink-0 w-36 rounded-xl border border-border bg-surface-raised p-3 space-y-2">
                  <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-lg bg-surface">
                    {card.image_url ? (
                      <Image src={card.image_url} alt={card.name} fill sizes="144px" className="object-contain" />
                    ) : (card.game_data as any)?.is_promo ? (
                      <Image src="/img/promo.png" alt="Promo" fill sizes="144px" className="object-contain" style={{ padding: "0.5rem" }} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-foreground truncate">{card.name}</p>
                  <div className="flex items-center justify-between">
                    {item.for_sale && item.list_price != null && (
                      <span className="text-xs font-semibold text-gold">${item.list_price.toFixed(2)}</span>
                    )}
                    {item.for_trade && !item.for_sale && (
                      <span className="text-xs text-blue-400">Trade</span>
                    )}
                  </div>
                  <Link href={`/inventory/${item.id}/edit`} className="block text-center rounded-lg border border-border px-2 py-1 text-xs text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors">
                    Edit
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Browse */}
      <div className="space-y-5">
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
              placeholder="Search listings by card name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-raised pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors">
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
              {wishedApiSet.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter("wanted")}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    filter === "wanted"
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-gold/30 text-gold/70 hover:border-gold/60 hover:text-gold"
                  }`}
                >
                  ★ Wanted ({wishedApiSet.size})
                </button>
              )}
              {followingUserSet.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter("following")}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    filter === "following"
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
                  }`}
                >
                  Following
                </button>
              )}
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

        {/* Results count */}
        <p className="text-xs text-foreground-muted">
          {visible.length} {visible.length === 1 ? "listing" : "listings"}
          {search.trim() ? ` for "${search.trim()}"` : ""}
        </p>

        {/* No results */}
        {visible.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface py-16 text-center space-y-3">
            <p className="text-sm text-foreground-muted">
              {search.trim() ? `No listings found for "${search.trim()}".` : "No listings match this filter."}
            </p>
            <div className="flex justify-center gap-4">
              {search.trim() && (
                <button type="button" onClick={() => setSearch("")} className="text-xs text-gold hover:text-gold-light transition-colors">Clear search</button>
              )}
              {filter !== "all" && (
                <button type="button" onClick={() => setFilter("all")} className="text-xs text-gold hover:text-gold-light transition-colors">Clear filter</button>
              )}
            </div>
          </div>
        )}

        {/* Listing grid */}
        {visible.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visible.map((item) => {
              const card = resolveCard(item);
              if (!card) return null;
              const condKey  = item.condition ?? "";
              const isOwn    = item.user_id === currentUserId;
              const isPromo  = !!(card.game_data as any)?.is_promo;

              return (
                <div key={item.id} className="group rounded-2xl border border-border bg-surface hover:border-gold/30 hover:bg-surface-raised transition-all duration-200 flex flex-col">

                  {/* Card image */}
                  <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-t-2xl bg-surface-raised">
                    {card.image_url ? (
                      <CardImage src={card.image_url} alt={card.name} />
                    ) : isPromo ? (
                      <div className="absolute inset-0 overflow-hidden">
                        <Image src="/img/promo.png" alt="Promo Card" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-contain" style={{ padding: "4rem 3rem" }} />
                        <div className="absolute top-12 bottom-12 left-6 right-6 rounded-xl border border-gold/40 pointer-events-none shadow-[0_0_12px_rgba(232,184,75,0.15)]" />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                        </svg>
                      </div>
                    )}

                    {/* Game badge */}
                    <span className="absolute top-2 left-2 rounded-full bg-background/80 backdrop-blur-sm px-2 py-0.5 text-xs font-medium text-foreground-muted capitalize">
                      {card.game}
                    </span>

                    {/* Listing type flags */}
                    <div className="absolute top-2 right-2 flex flex-row gap-1">
                      {isOwn && (
                        <span className="rounded-full bg-surface/90 border border-border px-2 py-0.5 text-xs font-medium text-foreground-muted">Yours</span>
                      )}
                      {item.for_sale && (
                        <span className="rounded-full bg-gold/90 px-2 py-0.5 text-xs font-semibold text-background">Sale</span>
                      )}
                      {item.for_trade && (
                        <span className="rounded-full bg-blue-400/90 px-2 py-0.5 text-xs font-semibold text-background">Trade</span>
                      )}
                    </div>

                    {/* Wanted badge */}
                    {!isOwn && wishedApiSet.has(getCardApiId(item)) && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-background shadow-sm">
                        ★ Wanted
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col flex-1 gap-3">
                    <div>
                      <Link href={`/marketplace/${item.id}`} className="font-semibold text-foreground leading-tight hover:text-gold transition-colors">
                        {card.name}
                      </Link>
                      <p className="text-xs text-foreground-muted mt-0.5">
                        {card.set_name}{card.card_number ? ` · ${card.card_number}` : ""}
                      </p>
                    </div>

                    {/* Condition / grade / finish */}
                    <div className="flex items-center gap-1 flex-wrap min-h-[1.375rem]">
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
                      {isPromo && (
                        <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">Promo</span>
                      )}
                    </div>

                    {/* Seller + price + actions — pinned to bottom */}
                    <div className="mt-auto space-y-3">
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs text-foreground-muted">
                        {isOwn ? (
                          <span className="text-gold font-medium">Your listing</span>
                        ) : (
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span>by <Link href={`/profile/${item.seller_username}`} className="text-foreground hover:text-gold transition-colors">@{item.seller_username}</Link></span>
                            {(sellerFollowerCounts[item.user_id] ?? 0) > 0 && (
                              <span className="text-foreground-muted opacity-60">
                                · {sellerFollowerCounts[item.user_id]} follower{sellerFollowerCounts[item.user_id] !== 1 ? "s" : ""}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      {item.for_sale && item.list_price != null ? (
                        <span className="text-base font-bold text-gold">${item.list_price.toFixed(2)}</span>
                      ) : item.for_trade && !item.for_sale ? (
                        <span className="text-xs font-medium text-blue-400">Open to Trade</span>
                      ) : (
                        <span className="text-xs text-foreground-muted">Trade + Sale</span>
                      )}
                    </div>

                    {/* Action */}
                    <div className="space-y-2">
                      {isOwn ? (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <Link
                              href={`/marketplace/${item.id}`}
                              className="text-center rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-gold/40 hover:bg-surface transition-colors"
                            >
                              View
                            </Link>
                            <Link
                              href={`/inventory/${item.id}/edit`}
                              className="text-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
                            >
                              Edit
                            </Link>
                          </div>
                          <div className="h-4" />
                        </>
                      ) : (
                        <Link
                          href={`/marketplace/${item.id}`}
                          className="block text-center rounded-xl bg-surface-raised border border-border px-4 py-2 text-xs font-medium text-foreground hover:border-gold/40 hover:bg-surface transition-colors"
                        >
                          View Listing
                        </Link>
                      )}
                      {!isOwn && (
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => toggleWatch(item.id)}
                            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                              watchedIds.has(item.id)
                                ? "text-rose-400 hover:text-rose-300"
                                : "text-foreground-muted hover:text-rose-400"
                            }`}
                          >
                            <HeartIcon filled={watchedIds.has(item.id)} />
                            {watchedIds.has(item.id) ? "Watching" : "Watch"}
                          </button>
                          <Link
                            href={`/marketplace/${item.id}`}
                            className="text-xs font-medium text-foreground-muted hover:text-gold transition-colors"
                          >
                            Make Offer →
                          </Link>
                        </div>
                      )}
                    </div>
                    </div>{/* end mt-auto */}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
