import { CardSearchProvider, SearchResult, SearchOptions, TcgPlayerData } from "./CardSearchProvider";
import { normalizeCardNumber } from "./cardNumber";

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
    const res = await fetch(`${BASE}/cards/${encodeURIComponent(id)}`, { headers, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as PokemonCardDetail) ?? null;
  } catch {
    return null;
  }
}

// A scan candidate is a search result plus the body-text fields (attacks, hp)
// the fingerprint ranker scores against. See lib/scan/fingerprint.ts.
export interface ScanCandidate extends SearchResult {
  attacks?: { name: string }[];
  hp?: string;
}

/**
 * Fingerprint retrieval for the card scanner. Unions two query families, deduped
 * by native id, returning cards enriched with attacks + hp so the ranker can score
 * by the discriminative body text:
 *   - `name:<cand>*` over OCR-derived name candidates
 *   - `attacks.name:...` over OCR-derived attack terms — this rescues cards whose
 *     Pokémon name OCRs badly (stylized foil) but whose attack text still reads.
 * pokemontcg.io only (the free Tier-1 identity path — see lib/scan/).
 */
export async function scanSearchPokemon(
  nameCandidates: string[],
  attackTerms: string[] = [],
): Promise<ScanCandidate[]> {
  const headers: Record<string, string> = process.env.POKEMON_TCG_API_KEY
    ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
    : {};
  const select = "id,name,number,rarity,subtypes,set,images,tcgplayer,attacks,hp";

  // Build ONE OR-combined Lucene query rather than a fetch per term. pokemontcg.io
  // rate-limits hard without an API key, so firing 12 requests per scan quickly
  // got us 429'd (empty pool → "couldn't identify"). One request per scan is far
  // more sustainable. Terms are sanitized so a clause can't 400 the whole query.
  const clauses: string[] = [];
  for (const cand of nameCandidates.slice(0, 5)) {
    const term = cand.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (term.length >= 3) clauses.push(`name:${term}*`);
  }
  for (const phrase of attackTerms.slice(0, 4)) {
    const clean = phrase.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (clean.length < 4) continue;
    clauses.push(clean.includes(" ") ? `attacks.name:"${clean}"` : `attacks.name:${clean}*`);
  }
  if (clauses.length === 0) return [];

  const params = new URLSearchParams({ q: clauses.join(" OR "), pageSize: "250", select });
  try {
    const res = await fetch(`${BASE}/cards?${params}`, { headers, next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    const byId = new Map<string, ScanCandidate>();
    for (const c of (json.data ?? []) as ScanCandidate[]) if (!byId.has(c.id)) byId.set(c.id, c);
    return [...byId.values()];
  } catch {
    return [];
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
      const res = await fetch(`${BASE}/cards/${encodeURIComponent(id)}?${params}`, {
        headers: this.getHeaders(),
        next: { revalidate: 3600 },
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
      "hyper rare":                "hyper_rare",
      "mega hyper rare":           "hyper_rare",
      "secret rare":               "secret_rare",
      "rare holo v":               "rare_holo_v",
      "rare holo vmax":            "rare_holo_vmax",
      "rare holo vstar":           "rare_holo_vstar",
      "rare ultra":                "rare_ultra",
      "rare rainbow":              "rare_rainbow",
      "rare secret":               "rare_secret",
      "rare shiny":                "rare_shiny",
      "rare shiny gx":             "rare_shiny_gx",
    };
    return map[apiRarity.toLowerCase()] ?? "";
  }
}
