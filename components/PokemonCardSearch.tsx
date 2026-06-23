"use client";

import { useState, useEffect, useRef } from "react";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

interface PokemonCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  subtypes?: string[];
  set: { id: string; name: string; releaseDate: string };
  images: { small: string; large: string };
  tcgplayer?: TcgPlayerData | null;
}

interface Props {
  onSelect: (card: PokemonCard) => void;
}

export function PokemonCardSearch({ onSelect }: Props) {
  const [query,      setQuery]      = useState("");
  const [setName,    setSetName]    = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [results,    setResults]    = useState<PokemonCard[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [open,       setOpen]       = useState(false);
  const [error,      setError]      = useState(false);
  const containerRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) return; // reset handled in the input's onChange

    // Abort any in-flight request when the query changes, so a slow earlier
    // response can never overwrite the current results (the "wrong card" race).
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ q: query });
        if (setName.length    >= 2) params.set("set",    setName);
        if (cardNumber.length >= 1) params.set("number", cardNumber);
        const res = await fetch(`/api/pokemon-cards?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const json = await res.json();
        setResults(json.data ?? []);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded — leave state to the newer request
        setResults([]);
        setError(true);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, setName, cardNumber]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(card: PokemonCard) {
    onSelect(card);
    setQuery(card.name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative space-y-2">
      <div className="relative">
        <input
          type="text"
          placeholder="Card name…"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (v.length < 2) { setResults([]); setOpen(false); setError(false); }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 pr-10 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none">
          {loading ? (
            <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Set (optional)…"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
        />
        <input
          type="text"
          placeholder="Card # (optional)…"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-surface shadow-xl overflow-hidden">
          {results.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => handleSelect(card)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-raised transition-colors"
              >
                <img
                  src={card.images.small}
                  alt={card.name}
                  className="h-10 w-7 rounded object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{card.name}</p>
                  <p className="text-xs text-foreground-muted truncate">
                    {card.set.name} · #{card.number}
                    {card.rarity ? ` · ${card.rarity}` : ""}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && error && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-red-400 shadow-xl">
          Search failed — try again.
        </div>
      )}

      {open && !loading && !error && results.length === 0 && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground-muted shadow-xl">
          No cards found.
        </div>
      )}
    </div>
  );
}
