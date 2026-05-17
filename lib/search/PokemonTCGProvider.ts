import { CardSearchProvider, SearchResult, SearchOptions } from "./CardSearchProvider";

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
        select:   "id,name,number,rarity,subtypes,set,images",
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
    const { set, promoRequested } = options;

    if (promoRequested) {
      const promoQ   = `name:${query}* set.name:*Promo*`;
      const generalQ = set ? `name:${query}* set.name:${set}*` : `name:${query}*`;

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

    const q = set ? `name:${query}* set.name:${set}*` : `name:${query}*`;
    return this.fetchCards(q, 60);
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
