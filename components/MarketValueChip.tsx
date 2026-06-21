"use client";

import { useEffect, useState } from "react";
import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

const provider = new PokemonTCGProvider();

type PricingSource = "justtcg" | "tcggo" | "pokewallet" | "pokemon_tcg";

const SOURCE_LABEL: Record<PricingSource, string> = {
  justtcg:     "JustTCG",
  tcggo:       "TCGGo",
  pokewallet:  "PokéWallet",
  pokemon_tcg: "cache",
};

interface Props {
  apiId: string;
  name: string;
  setName: string;
  number: string | null;
  finish: string | null;
  edition: string | null;
  condition: string | null;
  grader: string | null;
  grade: number | null;
}

/**
 * Lazily refreshes a single card's price on mount (warming the shared cache for
 * all users) and shows the resolved market value with a source/freshness chip.
 * Computes the displayed price with the same getMarketPrice() used everywhere
 * else, so finish/edition/condition/grade adjustments stay consistent.
 * No-ops silently for anonymous viewers (the refresh endpoint requires auth).
 */
export function MarketValueChip(props: Props) {
  // Freshness label is computed at fetch time (not during render) so the chip
  // stays a pure function of state.
  const [state, setState] = useState<{ price: number; source: PricingSource; isLive: boolean; freshness: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/card-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiId: props.apiId, name: props.name, setName: props.setName, number: props.number,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.prices) return;

        const price = provider.getMarketPrice(
          { prices: data.prices } as TcgPlayerData,
          props.finish, props.edition, props.condition, props.grader, props.grade,
        );
        if (price == null) return;

        const ageMs = Date.now() - new Date(data.updatedAt).getTime();
        const isLive = ageMs < 60 * 1000;
        setState({
          price,
          source: data.source,
          isLive,
          freshness: isLive ? "Live" : timeAgo(data.updatedAt),
        });
      } catch {
        /* network/auth failure: leave chip hidden */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.apiId]);

  if (!state) return null;

  const { isLive, freshness } = state;
  const label = SOURCE_LABEL[state.source] ?? state.source;

  return (
    <div className="pt-2">
      <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Market Value</p>
      <div className="flex items-center gap-2">
        <p className="text-lg font-semibold text-foreground">${state.price.toFixed(2)}</p>
        <span className="inline-flex items-center gap-1 text-[11px] text-foreground-muted" title={`Updated ${freshness}`}>
          <span className={isLive ? "text-green-400" : "text-foreground-muted"}>●</span>
          {freshness} · {label}
        </span>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
