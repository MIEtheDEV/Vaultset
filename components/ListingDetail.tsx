"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CardImage } from "@/components/CardImage";
import { MessageButton } from "@/components/MessageButton";
import { OfferModal } from "@/components/OfferModal";
import { createClient } from "@/utils/supabase/client";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";
import { timeAgo } from "@/lib/timeAgo";

const raritySystem = new PokemonRaritySystem();

// ── Display helpers ────────────────────────────────────────────────────────────

const CONDITION_LABEL: Record<string, string> = {
  mint: "Mint", near_mint: "Near Mint", lightly_played: "Lightly Played",
  moderately_played: "Moderately Played", heavily_played: "Heavily Played", damaged: "Damaged",
};
const CONDITION_COLOR: Record<string, string> = {
  mint: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  near_mint: "text-green-400 bg-green-400/10 border-green-400/20",
  lightly_played: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  moderately_played: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  heavily_played: "text-red-400 bg-red-400/10 border-red-400/20",
  damaged: "text-red-600 bg-red-600/10 border-red-600/20",
};
const FINISH_LABEL: Record<string, string> = {
  non_holo: "Non-Holo", holofoil: "Holofoil", reverse_holofoil: "Reverse Holofoil",
  textured_holofoil: "Textured Holofoil", gold_etched: "Gold Etched",
};
const VARIANT_LABEL: Record<string, string> = {
  standard_ex: "Standard ex", full_art: "Full Art",
  illustration_rare: "Illustration Rare (Alt Art)", special_illustration_rare: "Special Illustration Rare (Alt Art ex)",
  gold_card: "Gold Card", secret_rare: "Secret Rare", standard_holo: "Standard Holo",
  standard_v: "Standard V", vmax: "VMAX", vstar: "VSTAR",
  rainbow_rare: "Rainbow Rare", shiny_rare: "Shiny Rare", shiny_gx: "Shiny GX", ace_spec: "ACE SPEC",
};


function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Listing {
  id: string; user_id: string; condition: string | null; finish: string | null;
  for_sale: boolean; for_trade: boolean; list_price: number | null;
  quantity: number; grader: string | null; grade: number | null;
  cert_number: string | null; notes: string | null; created_at: string;
  on_hold: boolean;
}
interface Card {
  id: string; game: string; name: string; set_name: string;
  card_number: string | null; year: number | null; image_url: string | null;
  game_data: Record<string, unknown> | null;
}
interface Seller { id: string; username: string; created_at: string; }
interface OtherListing {
  id: string; for_sale: boolean; for_trade: boolean; list_price: number | null;
  grader: string | null; grade: number | null; condition: string | null;
  card: { name: string; set_name: string; image_url: string | null; game_data: Record<string, unknown> | null } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ListingDetail({
  listing, card, seller, otherListings, currentUserId, initialWatched,
}: {
  listing: Listing; card: Card; seller: Seller;
  otherListings: OtherListing[]; currentUserId: string; initialWatched: boolean;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const isOwn    = listing.user_id === currentUserId;
  const onHold   = listing.on_hold;
  const isPromo  = !!(card.game_data?.is_promo);
  const gd       = card.game_data ?? {};
  const rarity   = gd.rarity   as string | undefined;
  const variant  = gd.variant  as string | undefined;
  const edition  = gd.edition  as string | undefined;
  const isEx     = !!(gd.is_ex);

  async function toggleWatch() {
    const supabase = createClient();
    if (watched) {
      await supabase.from("watchlist").delete().eq("user_id", currentUserId).eq("item_id", listing.id);
    } else {
      await supabase.from("watchlist").insert({ user_id: currentUserId, item_id: listing.id });
    }
    setWatched((v) => !v);
  }

  const joinedDate = timeAgo(seller.created_at);

  return (
    <div className="space-y-10">

      {/* Back */}
      <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Marketplace
      </Link>

      {/* Hero */}
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">

        {/* Card image */}
        <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-2xl bg-surface-raised border border-border">
          {card.image_url ? (
            <CardImage src={card.image_url} alt={card.name} />
          ) : isPromo ? (
            <div className="absolute inset-0 overflow-hidden">
              <Image src="/img/promo.png" alt="Promo Card" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-contain" style={{ padding: "4rem 3rem" }} />
              <div className="absolute top-12 bottom-12 left-6 right-6 rounded-xl border border-gold/40 pointer-events-none shadow-[0_0_12px_rgba(232,184,75,0.15)]" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-foreground-muted">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
              </svg>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">

          {/* Card identity */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-surface-raised border border-border px-2 py-0.5 text-xs text-foreground-muted capitalize">{card.game}</span>
              {isPromo && <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">Promo</span>}
              {isEx    && <span className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs text-gold">ex</span>}
            </div>
            <h1 className="text-3xl font-bold text-foreground">{card.name}</h1>
            <p className="mt-1 text-foreground-muted">
              {card.set_name}
              {card.card_number ? ` · #${card.card_number}` : ""}
              {card.year ? ` · ${card.year}` : ""}
            </p>
          </div>

          {/* Card attributes */}
          <div className="flex flex-wrap gap-2">
            {rarity  && <span className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground-muted">{raritySystem.getDisplayLabel(rarity)}</span>}
            {variant && <span className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground-muted">{VARIANT_LABEL[variant] ?? variant}</span>}
            {listing.finish && <span className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground-muted">{FINISH_LABEL[listing.finish] ?? listing.finish}</span>}
            {edition === "1st_edition"  && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">1st Edition</span>}
            {edition === "shadowless"   && <span className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs text-foreground-muted">Shadowless</span>}
          </div>

          {/* Condition / Grade */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            {listing.grader ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Grade</p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-gold">{listing.grader} {listing.grade}</span>
                </div>
                {listing.cert_number && (
                  <p className="text-xs text-foreground-muted">Cert # {listing.cert_number}</p>
                )}
              </div>
            ) : listing.condition ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Condition</p>
                <span className={`inline-block rounded-full border px-3 py-1 text-sm font-medium ${CONDITION_COLOR[listing.condition] ?? "text-foreground-muted border-border"}`}>
                  {CONDITION_LABEL[listing.condition] ?? listing.condition}
                </span>
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">No condition specified.</p>
            )}
          </div>

          {/* Price */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-1">
            {listing.for_sale && listing.list_price != null ? (
              <>
                <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Asking Price</p>
                <p className="text-4xl font-bold text-gold">${listing.list_price.toFixed(2)}</p>
                {listing.for_trade && <p className="text-xs text-foreground-muted mt-1">Also open to trade offers.</p>}
              </>
            ) : listing.for_trade ? (
              <>
                <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Listing Type</p>
                <p className="text-2xl font-bold text-blue-400">Open to Trade</p>
              </>
            ) : null}
            {listing.quantity > 1 && (
              <p className="text-xs text-foreground-muted pt-1">{listing.quantity} available</p>
            )}
          </div>

          {/* Seller */}
          <div className="rounded-2xl border border-border bg-surface p-4 flex items-center justify-between gap-4">
            <div>
              <Link
                href={`/profile/${seller.username}`}
                className="text-sm font-semibold text-foreground hover:text-gold transition-colors"
              >
                @{seller.username}
              </Link>
              <p className="text-xs text-foreground-muted">Joined {joinedDate}</p>
              <p className="text-xs text-foreground-muted mt-0.5">Listed {timeAgo(listing.created_at)}</p>
            </div>
            <Link
              href={`/profile/${seller.username}`}
              className="text-xs text-gold hover:text-gold-light transition-colors flex-shrink-0"
            >
              View profile →
            </Link>
          </div>

          {/* On Hold banner */}
          {onHold && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-400">This listing is on hold</p>
                <p className="text-xs text-foreground-muted mt-0.5">A deal is in progress. This card is no longer available for offers.</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {isOwn ? (
              <Link
                href={`/inventory/${listing.id}/edit`}
                className="flex items-center justify-center w-full rounded-full border border-border px-6 py-3 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
              >
                Edit Your Listing
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleWatch}
                  className={`flex items-center justify-center gap-2 w-full rounded-full border px-6 py-3 text-sm font-medium transition-colors ${
                    watched
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                      : "border-border text-foreground-muted hover:border-rose-500/40 hover:text-rose-400"
                  }`}
                >
                  <HeartIcon filled={watched} />
                  {watched ? "Watching" : "Watch this listing"}
                </button>

                {!onHold && (
                  <>
                    <MessageButton
                      recipientId={seller.id}
                      listingId={listing.id}
                      label="Contact Seller"
                      className="flex items-center justify-center w-full rounded-full border border-border px-6 py-3 text-sm font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors disabled:opacity-50"
                    />

                    <OfferModal
                      listingId={listing.id}
                      recipientId={seller.id}
                      currentUserId={currentUserId}
                      sellerUsername={seller.username}
                      cardName={card.name}
                      listPrice={listing.list_price}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* More from this seller */}
      {otherListings.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-foreground">
            More from <span className="text-gold">@{seller.username}</span>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {otherListings.map((item) => {
              if (!item.card) return null;
              const otherIsPromo = !!(item.card.game_data as any)?.is_promo;
              return (
                <Link
                  key={item.id}
                  href={`/marketplace/${item.id}`}
                  className="flex-shrink-0 w-36 rounded-xl border border-border bg-surface hover:border-gold/30 hover:bg-surface-raised transition-all duration-200"
                >
                  <div className="relative aspect-[2.5/3.5] w-full overflow-hidden rounded-t-xl bg-surface-raised">
                    {item.card.image_url ? (
                      <Image src={item.card.image_url} alt={item.card.name} fill sizes="224px" className="object-contain" />
                    ) : otherIsPromo ? (
                      <Image src="/img/promo.png" alt="Promo" fill sizes="144px" className="object-contain" style={{ padding: "1.5rem 1rem" }} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-xs font-medium text-foreground truncate">{item.card.name}</p>
                    <p className="text-xs text-foreground-muted truncate">{item.card.set_name}</p>
                    {item.for_sale && item.list_price != null ? (
                      <p className="text-sm font-bold text-gold">${Number(item.list_price).toFixed(2)}</p>
                    ) : (
                      <p className="text-xs text-blue-400">For Trade</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
