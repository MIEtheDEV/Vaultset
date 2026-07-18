import { CardSearchProvider, SearchResult, SearchOptions, TcgPlayerData } from "./CardSearchProvider";
import { normalizeCardNumber } from "./cardNumber";
import { fetchWithTimeout } from "@/lib/http";

const BASE = "https://api.pokemontcg.io/v2";

// Full pokemontcg.io card object — the fields we surface on the card-data page
// beyond search/pricing (illustrator, attacks, EU Cardmarket prices, set totals…).
export interface PokemonCardDetail {
  hp?: string;
  types?: string[];
  subtypes?: string[];
  supertype?: string;
  evolvesFrom?: string;
  artist?: string;
  flavorText?: string;
  nationalPokedexNumbers?: number[];
  rarity?: string;
  regulationMark?: string;
  abilities?: { name: string; text: string; type?: string }[];
  attacks?: { name: string; cost?: string[]; damage?: string; text?: string }[];
  weaknesses?: { type: string; value: string }[];
  resistances?: { type: string; value: string }[];
  retreatCost?: string[];
  legalities?: { standard?: string; expanded?: string; unlimited?: string };
  set?: { id?: string; name?: string; series?: string; printedTotal?: number; total?: number; releaseDate?: string; images?: { symbol?: string; logo?: string } };
  cardmarket?: { url?: string; updatedAt?: string; prices?: Record<string, number | null> };
}

/**
 * Fetch the full pokemontcg.io card object by native id (not tcg:/manual:). Used
 * by the card-data page for card details, EU Cardmarket prices, and set context.
 * Cheap + revalidated hourly; returns null for non-native ids or on error.
 */
export async function fetchPokemonCardDetail(id: string): Promise<PokemonCardDetail | null> {
  if (id.startsWith("tcg:") || id.startsWith("manual:")) return null;
  try {
    const headers: Record<string, string> = process.env.POKEMON_TCG_API_KEY ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY } : {};
    // Hard timeout: this runs on the card-page render path, including the cold
    // (uncached) first crawl. Without it a slow/hanging upstream blocks the whole
    // page for ~30s+ and Googlebot times out. Detail is optional — the page renders
    // fine without it, and the cache still warms whenever the upstream is healthy.
    const res = await fetch(`${BASE}/cards/${encodeURIComponent(id)}`, { headers, next: { revalidate: 3600 }, signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as PokemonCardDetail) ?? null;
  } catch {
    return null;
  }
}

// A scan candidate is a search result plus the body-text fields (attacks,
// abilities, hp) the fingerprint ranker scores against. Abilities matter as much
// as attacks: some cards are defined by them (Empoleon ex → "Emperor's Stance",
// Pidgeot ex → "Quick Search") and their Pokémon name OCRs badly on full-art, so
// the ability text is often the only readable identity signal. See
// lib/scan/fingerprint.ts.
export interface ScanCandidate extends SearchResult {
  attacks?: { name: string }[];
  abilities?: { name: string }[];
  hp?: string;
}

/**
 * Fingerprint retrieval for the card scanner. Unions two query families, deduped
 * by native id, returning cards enriched with attacks + abilities + hp so the
 * ranker can score by the discriminative body text:
 *   - `name:<cand>*` over OCR-derived name candidates
 *   - `attacks.name:...` / `abilities.name:...` over OCR-derived move terms — this
 *     rescues cards whose Pokémon name OCRs badly (stylized foil) but whose attack
 *     or ability text still reads. We can't tell an attack term from an ability
 *     term at OCR time, so each move term probes both fields.
 * pokemontcg.io only (the free Tier-1 identity path — see lib/scan/).
 */
export async function scanSearchPokemon(
  nameCandidates: string[],
  attackTerms: string[] = [],
): Promise<ScanCandidate[]> {
  const headers: Record<string, string> = process.env.POKEMON_TCG_API_KEY
    ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
    : {};
  // No `tcgplayer` here: it's the heaviest field (a nested price object per card)
  // and multiplied across the pool it dominates the payload → slower response →
  // more timeouts. The scan shortlist doesn't need prices; when the user picks a
  // card the add flow lazily fetches its price (cache-first) via /api/card-price.
  // images stays (the picker thumbnail has no fallback).
  const select = "id,name,number,rarity,subtypes,set,images,attacks,abilities,hp";

  // Build ONE OR-combined Lucene query rather than a fetch per term. pokemontcg.io
  // rate-limits hard without an API key, so firing 12 requests per scan quickly
  // got us 429'd (empty pool → "couldn't identify"). One request per scan is far
  // more sustainable. Terms are sanitized so a clause can't 400 the whole query.
  const clauses: string[] = [];
  const nameTerms = new Set<string>();
  for (const cand of nameCandidates.slice(0, 5)) {
    const term = cand.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (term.length >= 3) nameTerms.add(term);
    // OCR routinely reads a stray leading character off the card border, energy
    // symbol, or a merged neighbouring glyph ("Raticate" → "dRaticate"), which
    // defeats a start-anchored prefix (name:draticate* matches nothing). Also probe
    // the term with its first character dropped so an inserted/garbled leading char
    // still resolves. Length-guarded (>=5) so we don't broaden a short candidate
    // into a giant prefix; deduped so a clean candidate isn't queried twice. A
    // dropped variant that isn't a real name prefix simply matches nothing (cheap),
    // and the ranker still requires a fuzzy name match, so this can't force a wrong
    // confident hit.
    if (term.length >= 5) nameTerms.add(term.slice(1));
  }
  for (const term of nameTerms) clauses.push(`name:${term}*`);
  for (const phrase of attackTerms.slice(0, 4)) {
    // Match each word as a prefix and AND them together, rather than a quoted
    // phrase. A quoted "emperor's stance" only matches with the exact apostrophe
    // (which OCR never gives) — stripping punctuation to "emperors stance" or
    // "emperor s stance" matched nothing. Per-word wildcards AND'd
    // (emperor* AND stance*) tolerate lost apostrophes, plurals, and OCR noise.
    // Drop <3-char glue tokens (a possessive "s", "of", "to").
    const words = phrase.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
      .filter((w) => w.length >= 3);
    if (words.length === 0) continue;
    // A move term could be an attack OR an ability name (OCR can't tell), so probe
    // both fields — Empoleon ex / Pidgeot ex are identifiable only via abilities.
    const forField = (field: string) => words.length === 1
      ? `${field}:${words[0]}*`
      : `(${words.map((w) => `${field}:${w}*`).join(" AND ")})`;
    clauses.push(forField("attacks.name"));
    clauses.push(forField("abilities.name"));
  }
  if (clauses.length === 0) return [];

  // pageSize 120 (was 250): observed fingerprint pools top out ~100, so this only
  // caps runaway result sets without truncating a real target — and a smaller cap
  // bounds the worst-case payload.
  const params = new URLSearchParams({ q: clauses.join(" OR "), pageSize: "120", select });
  const url = `${BASE}/cards?${params}`;
  // Retry once on timeout/network error. Keyless (and occasionally keyed)
  // pokemontcg.io latency spikes erratically under burst — a single request can
  // stall past the timeout while its neighbours return in <1s. When that abort hit
  // the pool came back empty and the scan reported "couldn't identify" even though
  // the card's name OCR'd perfectly. A fresh connection on the second attempt
  // clears the stalled one. 8s/attempt (×2) stays within the route's 30s budget
  // alongside the JustTCG probes. A non-OK response (429/4xx) is NOT retried —
  // that won't clear on an immediate retry and would just burn the budget.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers, next: { revalidate: 3600 } }, 8000);
      if (!res.ok) return [];
      const json = await res.json();
      const byId = new Map<string, ScanCandidate>();
      for (const c of (json.data ?? []) as ScanCandidate[]) if (!byId.has(c.id)) byId.set(c.id, c);
      return [...byId.values()];
    } catch {
      // timeout/network error — fall through to retry, then give up gracefully
    }
  }
  return [];
}

/**
 * Batch-fetch full search results by native pokemontcg.io id (scan candidates).
 * One request for the whole shortlist; adds rarity (drives the add form's
 * variant/finish default) + tcgplayer prices. Best-effort enrichment: a single
 * 8s-bounded attempt (NO retry — the retry could push the scan route past its
 * maxDuration and 504; the caller falls back to index metadata on []). Non-native
 * ids (tcg:/manual: — a colon 400s the Lucene query) are ignored.
 */
export async function fetchPokemonCardsByIds(ids: string[]): Promise<SearchResult[]> {
  const native = ids.filter((id) => !id.includes(":"));
  if (native.length === 0) return [];
  const headers: Record<string, string> = process.env.POKEMON_TCG_API_KEY
    ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
    : {};
  const params = new URLSearchParams({
    q: native.map((id) => `id:${id}`).join(" OR "),
    pageSize: String(native.length),
    select: "id,name,number,rarity,subtypes,set,images,tcgplayer",
  });
  try {
    const res = await fetchWithTimeout(`${BASE}/cards?${params}`, { headers, next: { revalidate: 3600 } }, 8000);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []) as SearchResult[];
  } catch {
    return []; // timeout/network — caller degrades to index metadata
  }
}

// Concrete implementation of CardSearchProvider for the Pokémon TCG API.
// All Pokémon-specific HTTP logic and field mapping lives here.
export class PokemonTCGProvider extends CardSearchProvider {
  readonly game = "pokemon";

  private getHeaders(): Record<string, string> {
    return process.env.POKEMON_TCG_API_KEY
      ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
      : {};
  }

  private async fetchCards(q: string, pageSize: number): Promise<SearchResult[]> {
    try {
      const params = new URLSearchParams({
        q,
        pageSize: String(pageSize),
        select:   "id,name,number,rarity,subtypes,set,images,tcgplayer",
        orderBy:  "-set.releaseDate",
      });
      const res = await fetch(`${BASE}/cards?${params}`, {
        headers: this.getHeaders(),
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<SearchResult | null> {
    // Native pokemontcg.io id only (e.g. "sv4-1"). tcg:/manual: keys aren't ours
    // to fetch here — the caller routes those elsewhere.
    if (id.startsWith("tcg:") || id.startsWith("manual:")) return null;
    try {
      const params = new URLSearchParams({ select: "id,name,number,rarity,subtypes,set,images,tcgplayer" });
      // Bounded: getById is the card-page render fallback for cards not in our DB —
      // an unbounded hang here stalls the whole page (and its crawl). See fetchPokemonCardDetail.
      const res = await fetch(`${BASE}/cards/${encodeURIComponent(id)}?${params}`, {
        headers: this.getHeaders(),
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.data as SearchResult) ?? null;
    } catch {
      return null;
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { set, number, promoRequested } = options;

    // Take each word's LEADING alphanumeric run as a prefix term, truncating at
    // intra-word punctuation: "Farfetch'd" → name:farfetch* (which pokemontcg.io
    // matches), whereas removing the punctuation gives "farfetchd" → 0 results.
    // "Mr. Mime" → name:mr* name:mime*, "Hop's Zacian" → name:hop* name:zacian*.
    const tokens = query.toLowerCase().split(/\s+/).map((w) => (w.match(/[a-z0-9]+/) ?? [""])[0]).filter(Boolean);
    if (tokens.length === 0) return [];
    const nameClause = tokens.map((w) => `name:${w}*`).join(" ");

    // Set is a safe narrowing filter; number is NOT used as a hard Lucene clause
    // (pokemontcg.io number formats vary — "067" / "TG12" / "SV01" — so an exact
    // `number:` filter can wrongly exclude the target card). The number instead
    // drives ranking below, and we widen the page so the target is in range.
    const setClause = set ? ` set.name:${set.replace(/[^a-zA-Z0-9 ]/g, "").trim()}*` : "";
    const q = promoRequested ? `${nameClause} set.name:*Promo*` : `${nameClause}${setClause}`;

    const cards = await this.fetchCards(q, number ? 40 : 25);
    return this.rankByRelevance(cards, query.trim().toLowerCase(), tokens, number ? normalizeCardNumber(number) : null);
  }

  /**
   * Re-rank API results (which arrive newest-first) by relevance to the query,
   * so the *right* card leads instead of merely the newest match. Stable sort:
   * equal scores keep the API's recency order. Score, high → low:
   *   +1000 exact (normalized) collector-number match, when a number was given
   *   +100  exact name · +50 name starts-with query · +20 all tokens present
   */
  private rankByRelevance(
    cards: SearchResult[],
    qLower: string,
    tokens: string[],
    wantNumber: string | null,
  ): SearchResult[] {
    const score = (c: SearchResult): number => {
      let s = 0;
      if (wantNumber && normalizeCardNumber(c.number) === wantNumber) s += 1000;
      const name = c.name.toLowerCase();
      const nameAlnum = name.replace(/[^a-z0-9]/g, "");
      if (name === qLower) s += 100;
      else if (name.startsWith(qLower)) s += 50;
      else if (tokens.every((t) => nameAlnum.includes(t))) s += 20;
      return s;
    };
    return cards
      .map((c, i) => ({ c, i, s: score(c) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.c);
  }

  getMarketPrice(
    tcgplayer: TcgPlayerData | null | undefined,
    finish: string | null,
    edition: string | null,
    condition: string | null = null,
    grader: string | null = null,
    grade: number | null = null,
    conditionPrices: Record<string, Record<string, number>> | null = null,
    gradedPrices: Record<string, Record<string, number>> | null = null,
  ): number | null {
    const key = this.resolveFinishKey(finish, edition);

    // Graded cards: prefer the real slab median for this exact grader+grade
    // (e.g. eBay PSA 10 median). Falls through to the grade multiplier when the
    // grade is absent (half grades, thin sample data, or non-pokemontcg.io card).
    if (grader && grade != null && gradedPrices) {
      const exact = gradedPrices[grader.toLowerCase()]?.[String(grade)];
      if (exact != null) return exact;
    }

    // Raw cards: prefer the source's real per-condition price (e.g. JustTCG's
    // actual LP/MP/HP/DMG value) over the NM×multiplier heuristic. Graded cards
    // skip this and use the multiplier path below.
    if (!grader && conditionPrices) {
      const condKey = condition === "mint" ? "near_mint" : condition;
      if (condKey) {
        for (const k of [key, "holofoil", "normal"]) {
          const price = conditionPrices[k]?.[condKey];
          if (price != null) return price;
        }
      }
    }

    // Fallback: NM market price × condition/grade multiplier.
    if (!tcgplayer?.prices) return null;
    for (const k of [key, "holofoil", "normal"]) {
      const price = tcgplayer.prices[k]?.market;
      if (price != null) {
        return price * this.getConditionMultiplier(condition, grader, grade);
      }
    }
    return null;
  }

  private getConditionMultiplier(
    condition: string | null,
    grader: string | null,
    grade: number | null,
  ): number {
    if (grader && grade != null) {
      if (grade >= 10)  return 3.50;
      if (grade >= 9.5) return 2.50;
      if (grade >= 9)   return 1.35;
      if (grade >= 8.5) return 1.10;
      if (grade >= 8)   return 1.00;
      if (grade >= 7)   return 0.75;
      if (grade >= 6)   return 0.60;
      if (grade >= 5)   return 0.50;
      if (grade >= 4)   return 0.40;
      return 0.25;
    }
    const multipliers: Record<string, number> = {
      mint:              1.00,
      near_mint:         1.00,
      lightly_played:    0.80,
      moderately_played: 0.65,
      heavily_played:    0.45,
      damaged:           0.25,
    };
    return multipliers[condition ?? ""] ?? 1.00;
  }

  private resolveFinishKey(finish: string | null, edition: string | null): string {
    const is1st = edition === "1st_edition";
    switch (finish) {
      case "non_holo":          return is1st ? "1stEditionNormal"   : "normal";
      case "holofoil":          return is1st ? "1stEditionHolofoil" : "holofoil";
      case "reverse_holofoil":  return "reverseHolofoil";
      case "textured_holofoil": return "holofoil";
      case "gold_etched":       return "holofoil";
      default:                  return is1st ? "1stEditionHolofoil" : "holofoil";
    }
  }

  mapRarity(apiRarity: string): string {
    const map: Record<string, string> = {
      "common":                    "common",
      "uncommon":                  "uncommon",
      "rare":                      "rare",
      "rare holo":                 "rare_holo",
      "ace spec rare":             "ace_spec_rare",
      "double rare":               "double_rare",
      "ultra rare":                "ultra_rare",
      "illustration rare":         "illustration_rare",
      "special illustration rare": "special_illustration_rare",
      // pokemontcg.io returns the Mega Evolution rarities as ALL_CAPS_UNDERSCORE
      // ("MEGA_ATTACK_RARE" / "MEGA_HYPER_RARE"), so their lowercased forms are
      // underscore-joined, not space-joined like the rest.
      "mega_attack_rare":          "mega_attack_rare",
      "mega attack rare":          "mega_attack_rare",
      "mega_hyper_rare":           "mega_hyper_rare",
      "mega hyper rare":           "mega_hyper_rare",
      "hyper rare":                "hyper_rare",
      "secret rare":               "rare_secret",
      // Legacy V / VMAX / VSTAR consolidate into Ultra Rare (Full Art).
      "rare holo v":               "rare_ultra",
      "rare holo vmax":            "rare_ultra",
      "rare holo vstar":           "rare_ultra",
      "rare ultra":                "rare_ultra",
      "rare rainbow":              "rare_rainbow",
      "rare secret":               "rare_secret",
      "rare shiny":                "rare_shiny",
      "rare shiny gx":             "rare_shiny_gx",
    };
    return map[apiRarity.toLowerCase()] ?? "";
  }
}
