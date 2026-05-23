import { CardSearchProvider, SearchResult, SearchOptions, TcgPlayerData } from "./CardSearchProvider";

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

    const nameClause   = `name:${query}*`;
    const setClause    = set    ? ` set.name:${set}*` : "";
    const numberClause = number ? ` number:${number}` : "";

    if (promoRequested) {
      const promoQ   = `${nameClause} set.name:*Promo*${numberClause}`;
      const generalQ = `${nameClause}${setClause}${numberClause}`;

      const [promoCards, generalCards] = await Promise.all([
        this.fetchCards(promoQ, 30),
        this.fetchCards(generalQ, 60),
      ]);

      const promoIds = new Set(promoCards.map((c) => c.id));
      return [
        ...promoCards,
        ...generalCards.filter((c) => !promoIds.has(c.id)),
      ];
    }

    const q = `${nameClause}${setClause}${numberClause}`;
    return this.fetchCards(q, 60);
  }

  getMarketPrice(
    tcgplayer: TcgPlayerData | null | undefined,
    finish: string | null,
    edition: string | null,
    condition: string | null = null,
    grader: string | null = null,
    grade: number | null = null,
  ): number | null {
    if (!tcgplayer?.prices) return null;
    const key = this.resolveFinishKey(finish, edition);
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
