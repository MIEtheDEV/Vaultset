"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getRaritySystem } from "@/lib/rarity";
import { FINISH_LABELS } from "@/lib/sets/setCardFinishes";
import type { CardStatus, Progress } from "@/lib/sets/masterset";

const raritySystem = getRaritySystem("pokemon");

type Mode = "complete" | "master";
type Ownership = "all" | "needed" | "captured";

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
    return cards.filter((c) => {
      if (rarity !== "all" && c.rarity !== rarity) return false;
      const captured = mode === "master" ? c.ownedMaster : c.ownedComplete;
      if (ownership === "needed" && captured) return false;
      if (ownership === "captured" && !captured) return false;
      return true;
    });
  }, [cards, mode, ownership, rarity]);

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
        {mode === "master" && hasPartial && (
          <p className="text-xs text-foreground-muted">
            Some cards in this set have special reverse-holo variants (e.g. Poké Ball / Master Ball
            patterns) that our data can&apos;t fully enumerate yet — the master-set total may be an
            undercount.
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
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-gold/50 focus:outline-none"
        >
          <option value="all">All rarities</option>
          {rarityOptions.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
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
        {owned && (
          <div className="absolute top-1.5 right-1.5 rounded-full bg-gold text-background w-5 h-5 flex items-center justify-center shadow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className={`text-sm font-medium truncate ${owned ? "text-foreground" : "text-foreground-muted"}`}>{card.name}</p>
        <p className="text-xs text-foreground-muted truncate">#{card.card_number}</p>
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
