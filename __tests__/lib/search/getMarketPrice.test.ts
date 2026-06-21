import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

const provider = new PokemonTCGProvider();

const tcg = (market: number): TcgPlayerData => ({
  url: "", updatedAt: "",
  prices: { holofoil: { low: null, mid: null, high: null, market, directLow: null } },
});

// Real per-condition prices from JustTCG.
const condPrices = { holofoil: { near_mint: 90, lightly_played: 70, damaged: 12 } };

describe("getMarketPrice with real per-condition prices", () => {
  it("uses the exact raw condition price instead of the NM multiplier", () => {
    // multiplier path would give 100 * 0.80 = 80; real LP price is 70.
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, "lightly_played", null, null, condPrices)).toBe(70);
  });

  it("maps 'mint' to the near_mint price", () => {
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, "mint", null, null, condPrices)).toBe(90);
  });

  it("falls back to NM × multiplier when the condition isn't in the data", () => {
    // 'moderately_played' absent from condPrices → 100 * 0.65 = 65.
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, "moderately_played", null, null, condPrices)).toBe(65);
  });

  it("ignores per-condition prices for graded cards (uses grade multiplier)", () => {
    // graded → 100 * 3.5 (PSA 10), NOT a raw condition price.
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, null, "PSA", 10, condPrices)).toBe(350);
  });

  it("still works (multiplier path) when no per-condition data is supplied", () => {
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, "lightly_played", null, null, null)).toBe(80);
  });
});

describe("getMarketPrice with graded slab prices", () => {
  const graded = { psa: { "9": 380, "10": 719 }, bgs: { "10": 857.59 } };

  it("uses the real slab median for an exact grader+grade", () => {
    // multiplier path would give 100 * 3.5 = 350; real PSA 10 median is 719.
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, null, "PSA", 10, null, graded)).toBe(719);
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, null, "BGS", 10, null, graded)).toBe(857.59);
  });

  it("is grader-case-insensitive", () => {
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, null, "psa", 9, null, graded)).toBe(380);
  });

  it("falls back to the grade multiplier for a half grade not in the data", () => {
    // PSA 9.5 absent → 100 * 2.5 (9.5 multiplier).
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, null, "PSA", 9.5, null, graded)).toBe(250);
  });

  it("falls back to the multiplier for a grader not covered", () => {
    // SGC absent → 100 * 3.5 (grade 10 multiplier).
    expect(provider.getMarketPrice(tcg(100), "holofoil", null, null, "SGC", 10, null, graded)).toBe(350);
  });
});
