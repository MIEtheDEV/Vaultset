"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { AVATAR_COLORS, resolveAvatarColor, isHexColor } from "@/lib/avatarColors";
import type { WishlistCardListing } from "@/lib/wishlistListings";

export interface WishlistDrawerCard {
  pokemon_api_id: string | null;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
}

type SortKey = "value" | "grade" | "price";

/** Best-value metric: fraction below market (positive = a deal). Null when it
 *  can't be computed (trade-only, or no price/market data). */
function valueScore(l: WishlistCardListing): number | null {
  if (!l.for_sale || l.list_price == null || l.market_price == null || l.market_price <= 0) return null;
  return (l.market_price - l.list_price) / l.market_price;
}

function formatCondition(c: string | null): string | null {
  if (!c) return null;
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function WishlistCardDrawer({ card, onClose }: { card: WishlistDrawerCard | null; onClose: () => void }) {
  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [card, onClose]);

  if (!card) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border p-5">
          <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-raised">
            {card.image_url && (
              <Image src={card.image_url} alt={card.card_name} fill sizes="64px" className="object-contain" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-tight text-foreground">{card.card_name}</h2>
            <p className="mt-0.5 text-sm text-foreground-muted truncate">{card.set_name}</p>
            {card.card_number && <p className="text-xs text-foreground-muted">#{card.card_number}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-foreground-muted hover:bg-surface-raised hover:text-foreground transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Keyed by card so it remounts (fresh state + fetch) per card. */}
        <DrawerBody key={card.pokemon_api_id ?? card.card_name} apiId={card.pokemon_api_id} />
      </div>
    </div>
  );
}

function DrawerBody({ apiId }: { apiId: string | null }) {
  const [listings, setListings] = useState<WishlistCardListing[] | null>(apiId ? null : []);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("value");
  const [followersOnly, setFollowersOnly] = useState(false);
  const [followedOnly, setFollowedOnly] = useState(false);

  useEffect(() => {
    if (!apiId) return;
    let cancelled = false;
    fetch(`/api/wishlist/listings?apiId=${encodeURIComponent(apiId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Failed to load listings")))
      .then((d) => { if (!cancelled) setListings(d.listings ?? []); })
      .catch((e) => { if (!cancelled) { setError(e.message); setListings([]); } });
    return () => { cancelled = true; };
  }, [apiId]);

  const visible = useMemo(() => {
    if (!listings) return [];
    const filtered = listings.filter((l) =>
      (!followersOnly || l.follows_me) && (!followedOnly || l.followed_by_me));

    const sorted = [...filtered];
    if (sort === "value") {
      sorted.sort((a, b) => {
        const av = valueScore(a), bv = valueScore(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      });
    } else if (sort === "grade") {
      sorted.sort((a, b) => (b.grade ?? -1) - (a.grade ?? -1));
    } else {
      // price: cheapest first; trade-only / unpriced last
      sorted.sort((a, b) => {
        if (a.list_price == null && b.list_price == null) return 0;
        if (a.list_price == null) return 1;
        if (b.list_price == null) return -1;
        return a.list_price - b.list_price;
      });
    }
    return sorted;
  }, [listings, sort, followersOnly, followedOnly]);

  const total = listings?.length ?? 0;

  return (
    <>
      {/* Controls */}
      <div className="space-y-2 border-b border-border px-5 py-3">
        <p className="text-xs text-foreground-muted">
          {listings == null ? "Finding listings…" : `${total} active ${total === 1 ? "listing" : "listings"}`}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground-muted mr-1">Sort</span>
          {([["value", "Best value"], ["grade", "Grade"], ["price", "Price"]] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                sort === key
                  ? "bg-gold text-background"
                  : "border border-border text-foreground-muted hover:text-foreground hover:border-gold/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground-muted mr-1">Filter</span>
          <button
            onClick={() => setFollowersOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              followersOnly ? "bg-gold/15 border border-gold/50 text-gold" : "border border-border text-foreground-muted hover:text-foreground hover:border-gold/40"
            }`}
          >
            Followers
          </button>
          <button
            onClick={() => setFollowedOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              followedOnly ? "bg-gold/15 border border-gold/50 text-gold" : "border border-border text-foreground-muted hover:text-foreground hover:border-gold/40"
            }`}
          >
            Followed
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {listings == null ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-foreground-muted">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-400">{error}</div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-foreground-muted">
            {total === 0
              ? "No one has this card listed right now."
              : "No listings match these filters."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((l) => <ListingRow key={l.listing_id} l={l} />)}
          </ul>
        )}
      </div>
    </>
  );
}

function ListingRow({ l }: { l: WishlistCardListing }) {
  const score = valueScore(l);
  const customHex = l.seller_avatar_color && isHexColor(l.seller_avatar_color) ? l.seller_avatar_color : null;
  const avatar = customHex ? null : AVATAR_COLORS[resolveAvatarColor(l.seller_avatar_color, l.seller_username)];
  const initial = l.seller_username.charAt(0).toUpperCase();
  const condition = formatCondition(l.condition);

  return (
    <li>
      <Link href={`/marketplace/${l.listing_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-raised transition-colors">
        {/* Avatar */}
        {l.seller_avatar_url ? (
          <img src={l.seller_avatar_url} alt={l.seller_username} className="h-9 w-9 shrink-0 rounded-full object-cover border border-border" />
        ) : customHex ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold select-none" style={{ background: customHex + "22", borderColor: customHex + "66", color: customHex }}>
            {initial}
          </div>
        ) : (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold select-none ${avatar!.bg} ${avatar!.border} ${avatar!.text}`}>
            {initial}
          </div>
        )}

        {/* Seller + card qualities */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-foreground">@{l.seller_username}</p>
            {l.seller_is_pro && (
              <span className="shrink-0 rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold">PRO</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {l.grader ? (
              <span className="rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold text-gold">{l.grader} {l.grade}</span>
            ) : condition ? (
              <span className="rounded-full border border-border px-1.5 py-0.5 text-[11px] text-foreground-muted">{condition}</span>
            ) : null}
            {l.follows_me && (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[11px] text-blue-400">Follows you</span>
            )}
            {l.followed_by_me && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-400">Following</span>
            )}
          </div>
        </div>

        {/* Price + value */}
        <div className="shrink-0 text-right">
          {l.for_sale && l.list_price != null ? (
            <p className="text-sm font-bold text-gold">${l.list_price.toFixed(2)}</p>
          ) : (
            <p className="text-sm text-blue-400">For Trade</p>
          )}
          {score != null && (
            <p className={`text-[11px] font-medium ${score > 0.001 ? "text-emerald-400" : score < -0.001 ? "text-red-400" : "text-foreground-muted"}`}>
              {score > 0.001 ? `↓${(score * 100).toFixed(0)}% under` : score < -0.001 ? `↑${(-score * 100).toFixed(0)}% over` : "at market"}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
