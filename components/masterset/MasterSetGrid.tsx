"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getRaritySystem } from "@/lib/rarity";
import { FINISH_LABELS } from "@/lib/sets/setCardFinishes";
import { compareCardNumbers } from "@/lib/sets/cardNumberSort";
import type { CardStatus, Progress } from "@/lib/sets/masterset";

const raritySystem = getRaritySystem("pokemon");

type Mode = "complete" | "master";
type Ownership = "all" | "needed" | "captured";
type Sort = "number" | "name" | "rarity" | "value" | "missing";

const SORT_LABELS: Record<Sort, string> = {
  number: "Card number",
  name: "Name (A–Z)",
  rarity: "Rarity",
  value: "Value (high → low)",
  missing: "Missing first",
};

export function MasterSetGrid({
  cards,
  complete,
  master,
  rarities,
  hasPartial,
}: {
  cards: CardStatus[];
  complete: Progress;
  master: Progress;
  rarities: string[];
  hasPartial: boolean;
}) {
  const [mode, setMode] = useState<Mode>("complete");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [rarity, setRarity] = useState<string>("all");
  // Collector number is the default: it's the order the set exists in physically,
  // so a collector scanning the grid can find a specific card without reading
  // every tile. Every other sort is a deliberate re-frame of that baseline.
  const [sort, setSort] = useState<Sort>("number");

  const progress = mode === "complete" ? complete : master;
  const pct = progress.total > 0 ? Math.round((progress.owned / progress.total) * 100) : 0;

  const rarityOptions = useMemo(
    () =>
      rarities
        .map((r) => ({ key: r, label: raritySystem.getDisplayLabel(r), sort: raritySystem.getSortOrder(r) }))
        .sort((a, b) => a.sort - b.sort),
    [rarities],
  );

  const visible = useMemo(() => {
    const filtered = cards.filter((c) => {
      if (rarity !== "all" && c.rarity !== rarity) return false;
      const captured = mode === "master" ? c.ownedMaster : c.ownedComplete;
      if (ownership === "needed" && captured) return false;
      if (ownership === "captured" && !captured) return false;
      return true;
    });

    // Every sort falls back to collector number, so ties never render in an
    // arbitrary order — two commons of the same rarity, or two unpriced cards,
    // still read in binder order rather than shuffling between renders.
    const byNumber = (a: CardStatus, b: CardStatus) =>
      compareCardNumbers(a.card_number, b.card_number);

    const comparators: Record<Sort, (a: CardStatus, b: CardStatus) => number> = {
      number: byNumber,
      name: (a, b) => a.name.localeCompare(b.name, "en") || byNumber(a, b),
      // Rarity ranks through the polymorphic rarity system, rarest first —
      // ascending, because a lower `sort` means a HIGHER rarity there. Unknown
      // rarities fall back to 999 and land at the end.
      rarity: (a, b) =>
        raritySystem.getSortOrder(a.rarity ?? "") - raritySystem.getSortOrder(b.rarity ?? "") ||
        byNumber(a, b),
      // Unpriced cards sort last rather than as $0 — "no data" isn't "worthless".
      value: (a, b) =>
        (b.value ?? -Infinity) - (a.value ?? -Infinity) || byNumber(a, b),
      // What's left to chase, in binder order.
      missing: (a, b) => {
        const capturedA = mode === "master" ? a.ownedMaster : a.ownedComplete;
        const capturedB = mode === "master" ? b.ownedMaster : b.ownedComplete;
        return Number(capturedA) - Number(capturedB) || byNumber(a, b);
      },
    };

    return filtered.sort(comparators[sort]);
  }, [cards, mode, ownership, rarity, sort]);

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-foreground-muted">
              {mode === "complete" ? "Complete Set" : "Master Set"} progress
            </p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {progress.owned}
              <span className="text-lg text-foreground-muted font-normal">/{progress.total}</span>
              <span className="ml-2 text-base text-gold font-semibold">{pct}%</span>
            </p>
          </div>
          {/* Mode toggle */}
          <div className="inline-flex rounded-lg border border-border bg-surface-raised p-0.5 text-sm">
            {(["complete", "master"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  mode === m ? "bg-gold text-background" : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {m === "complete" ? "Complete Set" : "Master Set"}
              </button>
            ))}
          </div>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {/* Standard reverse holos ARE counted now (they come from the TCGplayer
            printing keys, with TCGdex backstopping sets pokemontcg.io stopped
            pricing). What's still not enumerable from free data is the SPECIAL
            patterned reverses — so say that, rather than implying reverse holos
            are missing wholesale. */}
        {mode === "master" && hasPartial && (
          <p className="text-xs text-foreground-muted">
            Normal, holo and reverse-holo printings are all counted. Scarlet &amp; Violet–era sets
            also have special patterned reverses (Poké Ball / Master Ball) that free data
            doesn&apos;t list separately, so this total can still run slightly low.
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
          {(["all", "needed", "captured"] as Ownership[]).map((o) => (
            <button
              key={o}
              onClick={() => setOwnership(o)}
              className={`rounded-md px-3 py-1.5 capitalize transition-colors ${
                ownership === o ? "bg-surface-raised text-foreground font-medium" : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        <select
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
          aria-label="Filter by rarity"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-gold/50 focus:outline-none"
        >
          <option value="all">All rarities</option>
          {rarityOptions.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort cards"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-gold/50 focus:outline-none"
        >
          {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
            <option key={s} value={s}>Sort: {SORT_LABELS[s]}</option>
          ))}
        </select>
        <span className="text-sm text-foreground-muted">
          {visible.length} card{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <p className="text-sm text-foreground-muted py-12 text-center">No cards match these filters.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visible.map((c) => (
            <MasterSetTile key={`${c.card_number}-${c.pokemon_api_id ?? c.name}`} card={c} showFinishes={mode === "master"} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single variant slot: filled = that printing is in the collection. */
function VariantCheck({ finish, owned }: { finish: string; owned: boolean }) {
  const label = FINISH_LABELS[finish] ?? finish;
  return (
    <span
      title={`${label} — ${owned ? "collected" : "still needed"}`}
      // The empty slot sits on card art that can be any colour, so it needs its
      // own opaque backdrop — a translucent surface tint disappears over a
      // bright full-art.
      className={`rounded-full w-5 h-5 flex items-center justify-center shadow ${
        owned ? "bg-gold text-background" : "bg-background/85 text-foreground-muted ring-1 ring-inset ring-foreground-muted/50"
      }`}
    >
      <span className="sr-only">{`${label}: ${owned ? "collected" : "needed"}`}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
    </span>
  );
}

function MasterSetTile({ card, showFinishes }: { card: CardStatus; showFinishes: boolean }) {
  const owned = card.ownedComplete;
  const ownedSet = new Set(card.ownedFinishes);

  const inner = (
    <>
      <div className="relative aspect-[2.5/3.5] w-full bg-surface-raised">
        {card.image_url ? (
          <Image
            src={card.image_url}
            alt={card.name}
            fill
            sizes="(max-width:640px) 50vw, 20vw"
            className={`object-contain transition-all duration-300 ${owned ? "" : "opacity-40 grayscale"}`}
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center text-foreground-muted ${owned ? "" : "opacity-40"}`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          </div>
        )}
        {/* One check per printing the card exists in, so a card you own in only
            one of its three finishes reads as unfinished at a glance. Hidden
            entirely until the card is owned — an untouched card is already
            greyed out, and five empty circles on every tile is just noise. */}
        {owned && (
          <div
            className="absolute top-1.5 right-1.5 flex gap-1"
            aria-label={`${card.ownedFinishes.length} of ${card.finishes.length} variant${card.finishes.length !== 1 ? "s" : ""} collected`}
          >
            {card.finishes.map((f) => (
              <VariantCheck key={f} finish={f} owned={ownedSet.has(f)} />
            ))}
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className={`text-sm font-medium truncate ${owned ? "text-foreground" : "text-foreground-muted"}`}>{card.name}</p>
        <p className="text-xs text-foreground-muted truncate">
          #{card.card_number}
          {card.finishes.length > 0 && (
            <>
              {" · "}
              <span className={card.ownedMaster ? "text-gold" : undefined}>
                {card.ownedFinishes.length}/{card.finishes.length}
              </span>
              {" variant"}{card.finishes.length !== 1 ? "s" : ""}
            </>
          )}
        </p>
        {showFinishes && card.finishes.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {card.finishes.map((f) => {
              const has = ownedSet.has(f);
              return (
                <span
                  key={f}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                    has ? "border-gold/40 bg-gold/15 text-gold" : "border-border bg-surface-raised text-foreground-muted"
                  }`}
                  title={has ? `${FINISH_LABELS[f] ?? f} — owned` : `${FINISH_LABELS[f] ?? f} — needed`}
                >
                  {FINISH_LABELS[f] ?? f}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  const className =
    "group rounded-2xl border border-border bg-surface overflow-hidden hover:border-gold/30 hover:bg-surface-raised transition-colors";

  // Link owned & pokemontcg.io-native cards to their card-data page; others are static tiles.
  return card.pokemon_api_id ? (
    <Link href={`/card-data/${encodeURIComponent(card.pokemon_api_id)}`} className={className}>{inner}</Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
