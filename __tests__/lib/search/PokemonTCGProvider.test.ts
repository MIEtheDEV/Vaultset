import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";

describe("PokemonTCGProvider", () => {
  let provider: PokemonTCGProvider;

  beforeEach(() => {
    provider = new PokemonTCGProvider();
  });

  describe("game", () => {
    it("identifies as pokemon", () => {
      expect(provider.game).toBe("pokemon");
    });
  });

  describe("mapRarity", () => {
    it("maps basic rarities correctly", () => {
      expect(provider.mapRarity("common")).toBe("common");
      expect(provider.mapRarity("uncommon")).toBe("uncommon");
      expect(provider.mapRarity("rare")).toBe("rare");
    });

    it("maps modern Scarlet & Violet rarities correctly", () => {
      expect(provider.mapRarity("double rare")).toBe("double_rare");
      expect(provider.mapRarity("ultra rare")).toBe("ultra_rare");
      expect(provider.mapRarity("illustration rare")).toBe("illustration_rare");
      expect(provider.mapRarity("special illustration rare")).toBe(
        "special_illustration_rare"
      );
      expect(provider.mapRarity("hyper rare")).toBe("hyper_rare");
      expect(provider.mapRarity("secret rare")).toBe("secret_rare");
      expect(provider.mapRarity("ace spec rare")).toBe("ace_spec_rare");
    });

    it("maps legacy Sword & Shield / Sun & Moon rarities correctly", () => {
      expect(provider.mapRarity("rare holo")).toBe("rare_holo");
      expect(provider.mapRarity("rare holo v")).toBe("rare_holo_v");
      expect(provider.mapRarity("rare holo vmax")).toBe("rare_holo_vmax");
      expect(provider.mapRarity("rare holo vstar")).toBe("rare_holo_vstar");
      expect(provider.mapRarity("rare ultra")).toBe("rare_ultra");
      expect(provider.mapRarity("rare rainbow")).toBe("rare_rainbow");
      expect(provider.mapRarity("rare secret")).toBe("rare_secret");
      expect(provider.mapRarity("rare shiny")).toBe("rare_shiny");
      expect(provider.mapRarity("rare shiny gx")).toBe("rare_shiny_gx");
    });

    it("is case-insensitive", () => {
      expect(provider.mapRarity("Common")).toBe("common");
      expect(provider.mapRarity("RARE HOLO")).toBe("rare_holo");
      expect(provider.mapRarity("Double Rare")).toBe("double_rare");
      expect(provider.mapRarity("Special Illustration Rare")).toBe(
        "special_illustration_rare"
      );
    });

    it("maps both hyper rare aliases to the same internal key", () => {
      expect(provider.mapRarity("hyper rare")).toBe("hyper_rare");
      expect(provider.mapRarity("mega hyper rare")).toBe("hyper_rare");
    });

    it("returns an empty string for unknown rarity strings", () => {
      expect(provider.mapRarity("some made up rarity")).toBe("");
      expect(provider.mapRarity("")).toBe("");
    });
  });

  describe("search ranking & query building", () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

    const mk = (name: string, number: string) => ({
      id: `${name}-${number}`, name, number,
      set: { id: "s", name: "Set", releaseDate: "2024/01/01" },
      images: { small: "", large: "" },
    });

    function mockFetch(cards: unknown[]) {
      const calls: string[] = [];
      global.fetch = jest.fn(async (url: string) => {
        calls.push(String(url));
        return { ok: true, json: async () => ({ data: cards }) };
      }) as unknown as typeof fetch;
      return calls;
    }

    it("floats the exact collector-number match to the top, with a single upstream call", async () => {
      // API order is recency-first (#131 newest); the requested #67 must lead.
      const calls = mockFetch([mk("Tapu Koko", "131"), mk("Tapu Koko", "67"), mk("Tapu Koko", "51")]);
      const out = await provider.search("Tapu Koko", { number: "67" });
      expect(out[0].number).toBe("67");
      expect(calls).toHaveLength(1); // no separate promo fetch
    });

    it("normalizes number formats so 67 matches 067", async () => {
      mockFetch([mk("Pikachu", "058"), mk("Pikachu", "067")]);
      const out = await provider.search("Pikachu", { number: "67" });
      expect(out[0].number).toBe("067");
    });

    it("ranks an exact name above a partial match", async () => {
      mockFetch([mk("Charizard ex", "6"), mk("Charizard", "4")]);
      const out = await provider.search("Charizard");
      expect(out[0].name).toBe("Charizard");
    });

    it("truncates intra-word punctuation to a matchable prefix term", async () => {
      // "Farfetch'd" → name:farfetch* (matches), NOT name:farfetchd* (0 results).
      const calls = mockFetch([mk("Farfetch'd", "27")]);
      const out = await provider.search("Farfetch'd");
      const q = decodeURIComponent(calls[0]);
      expect(q).toContain("name:farfetch*");
      expect(q).not.toContain("farfetchd");
      expect(out).toHaveLength(1);
    });

    it("splits a punctuated multi-word name into per-word prefix terms", async () => {
      const calls = mockFetch([mk("Mr. Mime", "122")]);
      await provider.search("Mr. Mime");
      const q = decodeURIComponent(calls[0]);
      expect(q).toContain("name:mr*");
      expect(q).toContain("name:mime*");
    });

    it("includes a promo filter only on explicit promo intent", async () => {
      const general = mockFetch([]);
      await provider.search("Pikachu");
      expect(decodeURIComponent(general[0])).not.toContain("Promo");

      const promo = mockFetch([]);
      await provider.search("Pikachu", { promoRequested: true });
      expect(decodeURIComponent(promo[0])).toContain("Promo");
    });
  });
});
