"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface Card {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: { id: string; name: string };
  images: { small: string; large: string };
}

export function CardSearchBrowser({ autoFocus = false, loggedIn = true }: { autoFocus?: boolean; loggedIn?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  // Seed the query from a ?q= URL param so deep links work — e.g. Google's
  // sitelinks search box (SearchAction) hands off to /card-data?q=<term>. Read
  // window.location directly (not useSearchParams) to avoid forcing a Suspense
  // boundary / dynamic rendering on the static card-data hub. Mount-only.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    // Debounce + abort so a slow earlier response can't overwrite newer results.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/pokemon-cards?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const json = await res.json();
        setResults(json.data ?? []);
        setSearched(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setResults([]);
        setError(true);
        setSearched(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any card by name…"
          className="w-full rounded-xl border border-border bg-surface-raised pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
        />
      </div>

      {!loggedIn && (
        <p className="text-xs text-foreground-muted">
          Showing cards already on Vaultset.{" "}
          <Link href="/login" className="text-gold underline underline-offset-2 hover:text-gold-light transition-colors">Sign in</Link>{" "}
          to search the full Pokémon TCG catalog.
        </p>
      )}

      {loading && <p className="text-sm text-foreground-muted">Searching…</p>}
      {error && <p className="text-sm text-red-400">Search failed — please try again.</p>}
      {!loading && !error && searched && results.length === 0 && (
        <p className="text-sm text-foreground-muted">
          No {loggedIn ? "" : "added "}cards found for &ldquo;{query.trim()}&rdquo;.
          {!loggedIn && " Sign in to search the full catalog."}
        </p>
      )}
      {!searched && !loading && (
        <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-foreground-muted">
            {loggedIn ? "Search the full catalog — even cards no one has added yet." : "Search cards already on Vaultset."}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Open a card to see its market value, price history, and availability.{loggedIn ? " Pricing is pulled on demand." : ""}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {results.map((c) => (
            <Link
              key={c.id}
              href={`/card-data/${encodeURIComponent(c.id)}`}
              className="group rounded-2xl border border-border bg-surface overflow-hidden hover:border-gold/30 hover:bg-surface-raised transition-colors"
            >
              <div className="relative aspect-[2.5/3.5] w-full bg-surface-raised">
                {c.images?.small ? (
                  <Image src={c.images.small} alt={c.name} fill sizes="(max-width:640px) 50vw, 20vw" className="object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground-muted">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                  </div>
                )}
              </div>
              <div className="p-3 space-y-0.5">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-gold transition-colors">{c.name}</p>
                <p className="text-xs text-foreground-muted truncate">
                  {c.set?.name}{c.number ? ` · #${c.number}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
