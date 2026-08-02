import {
  tcgdexPriceKeys,
  findTcgdexSet,
  fetchTcgdexSetCards,
  resetTcgdexSetCache,
  numberingAlignment,
  MIN_NUMBERING_ALIGNMENT,
} from "@/lib/sets/tcgdex";
import { deriveFinishes } from "@/lib/sets/setCardFinishes";

// TCGdex backstops two pokemontcg.io failures in the ME era: sets it stopped
// pricing (no printing keys → no reverse holos) and sets it serves fewer cards
// for than it declares. Its job is to hand `deriveFinishes` the same shape of key
// `tcgplayer.prices` would have — so what matters here is the key translation
// and the end-to-end "does a common get its reverse holo back".

describe("tcgdexPriceKeys", () => {
  it("translates TCGdex's kebab-case printings to pokemontcg.io spelling", () => {
    const keys = tcgdexPriceKeys({
      variants_detailed: [
        { pricing: { tcgplayer: { unit: "USD", updated: "2026-08-01", "normal": {}, "reverse-holofoil": {} } } },
      ],
    });
    expect(keys.sort()).toEqual(["normal", "reverseHolofoil"]);
  });

  it("unions keys across variant entries and ignores metadata fields", () => {
    // A real Chaos Rising rare lists the same printings under repeated entries.
    const keys = tcgdexPriceKeys({
      variants_detailed: [
        { pricing: { tcgplayer: { unit: "USD", "reverse-holofoil": {}, "holofoil": {} } } },
        { pricing: { tcgplayer: { updated: "2026-08-01", "holofoil": {} } } },
        { pricing: null },
        {},
      ],
    });
    expect(keys.sort()).toEqual(["holofoil", "reverseHolofoil"]);
  });

  it("passes an unrecognized printing through rather than swallowing it", () => {
    const keys = tcgdexPriceKeys({ variants_detailed: [{ pricing: { tcgplayer: { "poke-ball-holofoil": {} } } }] });
    expect(keys).toEqual(["poke-ball-holofoil"]);
  });

  it("returns nothing for a card with no pricing at all", () => {
    expect(tcgdexPriceKeys({})).toEqual([]);
    expect(tcgdexPriceKeys({ variants_detailed: null })).toEqual([]);
  });
});

describe("findTcgdexSet", () => {
  // The two catalogs disagree on id scheme ("me4" vs "me04"), so we match names.
  const sets = [{ id: "me04", name: "Chaos Rising" }, { id: "sv03", name: "Obsidian Flames" }];

  it("matches on the normalized set name, not the id", () => {
    expect(findTcgdexSet(sets, "Chaos Rising")?.id).toBe("me04");
  });

  it("ignores case and punctuation differences", () => {
    expect(findTcgdexSet([{ id: "sv01", name: "Scarlet & Violet" }], "scarlet and violet")).toBeUndefined();
    expect(findTcgdexSet([{ id: "cel25", name: "Celebrations" }], "  celebrations ")?.id).toBe("cel25");
  });

  it("returns undefined when TCGdex doesn't carry the set", () => {
    expect(findTcgdexSet(sets, "Pitch Black")).toBeUndefined();
  });
});

describe("numberingAlignment", () => {
  // The guard that stops a gap-fill from appending duplicates when the two
  // catalogs number a set differently.
  it("is 1 when TCGdex covers every number we hold", () => {
    // me2pt5: TCGdex has all 250 of ours plus the 45-card tail it's missing.
    expect(numberingAlignment(["1", "2", "3", "4"], new Set(["1", "2", "3"]))).toBe(1);
  });

  it("is 0 for Celebrations-style disjoint numbering", () => {
    // TCGdex says CC001…, pokemontcg.io keeps the original set numbers.
    expect(numberingAlignment(["cc001", "cc002"], new Set(["2", "4"]))).toBe(0);
  });

  it("falls below the threshold on partial overlap", () => {
    expect(numberingAlignment(["1", "2", "x"], new Set(["1", "2", "3", "4"]))).toBeLessThan(MIN_NUMBERING_ALIGNMENT);
  });

  it("refuses to vouch for numbering when we hold nothing to compare against", () => {
    expect(numberingAlignment(["1", "2"], new Set())).toBe(0);
  });

  it("accepts the one-card-short case the me2pt5/Black Bolt fix depends on", () => {
    const ours = new Set(Array.from({ length: 171 }, (_, i) => String(i + 1)));
    const theirs = Array.from({ length: 172 }, (_, i) => String(i + 1));
    expect(numberingAlignment(theirs, ours)).toBeGreaterThanOrEqual(MIN_NUMBERING_ALIGNMENT);
  });
});

describe("fetchTcgdexSetCards", () => {
  beforeEach(resetTcgdexSetCache);

  const stubApi = (cards: Record<string, unknown>) => (url: string) => {
    if (url.endsWith("/sets")) return Promise.resolve([{ id: "me04", name: "Chaos Rising" }]);
    if (url.endsWith("/sets/me04")) {
      return Promise.resolve({ cards: Object.keys(cards).map((localId) => ({ id: `me04-${localId}`, localId })) });
    }
    const localId = url.split("me04-")[1];
    return Promise.resolve(cards[localId]);
  };

  it("keys cards by normalized collector number and keeps the raw one for display", async () => {
    const dex = await fetchTcgdexSetCards("Chaos Rising", {
      fetchJson: stubApi({
        "006": { name: "Quilladin", rarity: "Common", variants_detailed: [{ pricing: { tcgplayer: { "normal": {}, "reverse-holofoil": {} } } }] },
        "100": { name: "Mega Greninja ex", rarity: "Ultra Rare", variants_detailed: [{ pricing: { tcgplayer: { "holofoil": {} } } }] },
      }),
    });
    // "006" → "6", the same normalization ownership matching uses.
    expect(dex?.get("6")?.priceKeys.sort()).toEqual(["normal", "reverseHolofoil"]);
    expect(dex?.get("6")?.numberRaw).toBe("006");
    expect(dex?.get("6")?.name).toBe("Quilladin");
    expect(dex?.get("100")?.rarity).toBe("Ultra Rare");
  });

  it("builds a grid-sized image url from the asset base", async () => {
    const dex = await fetchTcgdexSetCards("Chaos Rising", {
      fetchJson: stubApi({ "1": { name: "Weedle", image: "https://assets.tcgdex.net/en/me/me04/001" } }),
    });
    expect(dex?.get("1")?.imageUrl).toBe("https://assets.tcgdex.net/en/me/me04/001/low.webp");
  });

  it("leaves imageUrl null when TCGdex has no scan yet", async () => {
    const dex = await fetchTcgdexSetCards("Chaos Rising", { fetchJson: stubApi({ "1": { name: "Weedle" } }) });
    expect(dex?.get("1")?.imageUrl).toBeNull();
  });

  it("still returns a card TCGdex has no pricing for, with empty priceKeys", async () => {
    // The caller needs the card (it may be one pokemontcg.io omitted entirely),
    // but must not read empty keys as "this card has no printings".
    const dex = await fetchTcgdexSetCards("Chaos Rising", {
      fetchJson: stubApi({
        "1": { name: "A", variants_detailed: [{ pricing: { tcgplayer: { "normal": {} } } }] },
        "2": { name: "B", variants_detailed: [] },
      }),
    });
    expect(dex?.get("1")?.priceKeys).toEqual(["normal"]);
    expect(dex?.get("2")?.priceKeys).toEqual([]);
  });

  it("returns null when TCGdex doesn't carry the set, so the caller keeps its own data", async () => {
    const dex = await fetchTcgdexSetCards("Set That Does Not Exist", { fetchJson: stubApi({ "1": {} }) });
    expect(dex).toBeNull();
  });

  it("survives a single card failing without losing the rest of the set", async () => {
    const dex = await fetchTcgdexSetCards("Chaos Rising", {
      fetchJson: (url: string) => {
        if (url.endsWith("me04-2")) return Promise.reject(new Error("HTTP 500"));
        return stubApi({
          "1": { name: "A", variants_detailed: [{ pricing: { tcgplayer: { "normal": {}, "reverse-holofoil": {} } } }] },
          "2": { name: "B" },
        })(url);
      },
    });
    expect(dex?.get("1")?.priceKeys.sort()).toEqual(["normal", "reverseHolofoil"]);
    expect(dex?.has("2")).toBe(false);
  });
});

describe("the Chaos Rising regression", () => {
  // Before the fallback, pokemontcg.io returned no price keys for me4 and every
  // card collapsed to one guessed finish — 122 printings for a 198-card master
  // set. These are the three shapes that make up the difference.
  it("restores the reverse holo the empty-priceKeys fallback dropped", () => {
    expect(deriveFinishes({ priceKeys: [], rarityKey: "common", setReleaseYear: 2026 }).finishes)
      .toEqual(["non_holo"]);

    const withTcgdex = tcgdexPriceKeys({
      variants_detailed: [{ pricing: { tcgplayer: { "normal": {}, "reverse-holofoil": {} } } }],
    });
    expect(deriveFinishes({ priceKeys: withTcgdex, rarityKey: "common", setReleaseYear: 2026 }).finishes)
      .toEqual(["non_holo", "reverse_holofoil"]);
  });

  it("corrects an ME-era rare from guessed non-holo to holo + reverse", () => {
    // me4-10 (Ho-Oh): the guess said non_holo; TCGdex says holofoil + reverse.
    const keys = tcgdexPriceKeys({
      variants_detailed: [{ pricing: { tcgplayer: { "reverse-holofoil": {}, "holofoil": {} } } }],
    });
    expect(deriveFinishes({ priceKeys: keys, rarityKey: "rare", setReleaseYear: 2026 }).finishes)
      .toEqual(["holofoil", "reverse_holofoil"]);
  });

  it("leaves a secret rare as its single relabeled printing", () => {
    const keys = tcgdexPriceKeys({ variants_detailed: [{ pricing: { tcgplayer: { "holofoil": {} } } }] });
    expect(deriveFinishes({ priceKeys: keys, rarityKey: "ultra_rare", setReleaseYear: 2026 }).finishes)
      .toEqual(["textured_holofoil"]);
  });

  it("stays flagged partial — ME-era Poké Ball reverses still aren't enumerable", () => {
    const keys = tcgdexPriceKeys({
      variants_detailed: [{ pricing: { tcgplayer: { "normal": {}, "reverse-holofoil": {} } } }],
    });
    expect(deriveFinishes({ priceKeys: keys, rarityKey: "common", setReleaseYear: 2026 }).fidelity)
      .toBe("partial");
  });
});
