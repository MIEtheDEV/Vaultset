"use client";

import { useEffect, useState } from "react";
import { CollectorCard } from "@/components/CollectorCard";
import type { CollectorSummary } from "@/lib/collectors";

const MIN_QUERY = 2;

type SearchState = {
  /** The query these results belong to — results render only when it's current. */
  query: string;
  failed: boolean;
  results: CollectorSummary[];
};

/**
 * Type-ahead collector search for the community page.
 *
 * Lives on the client so the page itself stays static/ISR — results come from
 * `/api/collectors`, which reads only public profile data, so signed-out
 * visitors (and crawlers, which never type) get the same behaviour.
 *
 * Results are stamped with the query that produced them instead of being cleared
 * on every keystroke: what to show is then derived from whether that stamp still
 * matches the input, so the effect never has to setState synchronously.
 */
export function CollectorSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ query: "", failed: false, results: [] });

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_QUERY;
  const settled = active && state.query === trimmed;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;

    // Abort the in-flight request whenever the query moves on, so a slow earlier
    // response can't land on top of newer results.
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/collectors?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const json = await res.json();
        setState({ query: trimmed, failed: false, results: json.collectors ?? [] });
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded — newer query owns the state
        setState({ query: trimmed, failed: true, results: [] });
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search collectors by username, city, or specialty"
          aria-label="Search collectors"
          className="w-full rounded-full border border-border bg-surface py-3 pl-11 pr-11 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold/40 focus:outline-none"
        />

        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-foreground-muted transition-colors hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {trimmed.length > 0 && !active && (
        <p className="text-xs text-foreground-muted">Keep typing — at least {MIN_QUERY} characters.</p>
      )}

      {active && !settled && <p className="text-xs text-foreground-muted">Searching…</p>}

      {settled && state.failed && (
        <p className="text-xs text-red-400">Search failed. Try again in a moment.</p>
      )}

      {settled && !state.failed && state.results.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface py-10 text-center">
          <p className="text-sm text-foreground-muted">
            No collectors match &ldquo;{trimmed}&rdquo;.
          </p>
        </div>
      )}

      {settled && state.results.length > 0 && (
        <>
          <p className="text-xs text-foreground-muted">
            {state.results.length} collector{state.results.length !== 1 ? "s" : ""} found
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {state.results.map((c) => (
              <CollectorCard key={c.id} collector={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
