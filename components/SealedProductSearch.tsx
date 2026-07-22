"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { SealedProductResult } from "@/lib/search/justTcgSearch";

interface Props {
  onSelect: (product: SealedProductResult) => void;
}

/**
 * Type-ahead search for sealed products (ETBs, booster boxes, bundles, …),
 * backed by /api/sealed-products (JustTCG). Selecting a result hands the caller
 * the product's real TCGplayer id + current sealed market price. Mirrors
 * PokemonCardSearch's debounce + abort + click-away behaviour.
 */
export function SealedProductSearch({ onSelect }: Props) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SealedProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const [error,   setError]   = useState(false);
  const containerRef          = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) return; // reset handled in the input's onChange

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ q: query });
        const res = await fetch(`/api/sealed-products?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const json = await res.json();
        setResults(json.data ?? []);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded
        setResults([]);
        setError(true);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(product: SealedProductResult) {
    onSelect(product);
    setQuery(product.name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          placeholder="Search sealed products (e.g. Surging Sparks ETB)…"
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

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-surface shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {results.map((p) => (
            <li key={p.tcgplayerId}>
              <button
                type="button"
                onClick={() => handleSelect(p)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-raised transition-colors"
              >
                {p.image ? (
                  <Image
                    src={p.image}
                    alt={p.name}
                    width={28}
                    height={40}
                    sizes="28px"
                    className="h-10 w-7 rounded object-contain flex-shrink-0 bg-surface-raised"
                  />
                ) : (
                  <div className="h-10 w-7 rounded bg-surface-raised flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-foreground-muted truncate">{p.setName}</p>
                </div>
                {p.marketValue != null && (
                  <span className="text-xs font-semibold text-gold whitespace-nowrap">
                    ${p.marketValue.toFixed(2)}
                  </span>
                )}
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
          No sealed products found — you can still enter the name manually below.
        </div>
      )}
    </div>
  );
}
