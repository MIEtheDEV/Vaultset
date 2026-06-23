import { CardSearchProvider, SearchResult, SearchOptions, TcgPlayerData } from "./CardSearchProvider";
import { normalizeCardNumber } from "./cardNumber";

const BASE = "https://api.pokemontcg.io/v2";

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
