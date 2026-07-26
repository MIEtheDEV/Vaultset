import { deriveFinishes, sortFinishes, FINISH_LABELS } from "@/lib/sets/setCardFinishes";

// Holofoil and reverse holofoil are DISTINCT printings of the same card number.
// This derivation is the single source of truth for both sides of that claim:
// the master-set denominator (set_cards.finishes) and the finish options the
// add form offers. A rarity's locked finish is the printing its symbol implies,
// never proof that it's the card's only printing.

describe("deriveFinishes", () => {
  it("keeps holofoil and reverse holofoil as separate printings of a rare holo", () => {
    const { finishes } = deriveFinishes({
      priceKeys: ["holofoil", "reverseHolofoil"],
      rarityKey: "rare_holo",
    });
    expect(finishes).toEqual(["holofoil", "reverse_holofoil"]);
  });

  it("counts a common's normal and reverse printings separately", () => {
    const { finishes } = deriveFinishes({
      priceKeys: ["normal", "reverseHolofoil"],
      rarityKey: "common",
    });
    expect(finishes).toEqual(["non_holo", "reverse_holofoil"]);
  });

  it("does not invent a reverse holo for cards printed only as holo", () => {
    // Modern ex / illustration rares have no reverse-holo printing.
    const { finishes } = deriveFinishes({
      priceKeys: ["holofoil"],
      rarityKey: "double_rare",
    });
    expect(finishes).toEqual(["holofoil"]);
  });

  it("relabels the generic holofoil price key to the rarity's true finish", () => {
    expect(deriveFinishes({ priceKeys: ["holofoil"], rarityKey: "hyper_rare" }).finishes)
      .toEqual(["gold_etched"]);
    expect(deriveFinishes({ priceKeys: ["holofoil"], rarityKey: "ultra_rare" }).finishes)
      .toEqual(["textured_holofoil"]);
  });

  it("still splits reverse holo out when the holo key is relabelled", () => {
    const { finishes } = deriveFinishes({
      priceKeys: ["holofoil", "reverseHolofoil"],
      rarityKey: "rare_rainbow",
    });
    expect(finishes).toEqual(["reverse_holofoil", "textured_holofoil"]);
  });

  it("treats 1st edition price keys as their base finishes", () => {
    const { finishes } = deriveFinishes({
      priceKeys: ["1stEditionNormal", "1stEditionHolofoil"],
      rarityKey: "rare_holo",
    });
    expect(finishes).toEqual(["non_holo", "holofoil"]);
  });

  it("falls back to the rarity's locked finish when there is no price data", () => {
    const { finishes, fidelity } = deriveFinishes({ rarityKey: "rare_holo" });
    expect(finishes).toEqual(["holofoil"]);
    expect(fidelity).toBe("partial"); // honest limits — the list may be incomplete
  });

  it("flags SV-era sets as partial, since Poké Ball / Master Ball reverses aren't enumerable", () => {
    expect(deriveFinishes({ priceKeys: ["normal", "reverseHolofoil"], setReleaseYear: 2024 }).fidelity)
      .toBe("partial");
    expect(deriveFinishes({ priceKeys: ["normal", "reverseHolofoil"], setReleaseYear: 2016 }).fidelity)
      .toBe("derived");
  });

  it("orders finishes base → premium regardless of price-key order", () => {
    expect(sortFinishes(["gold_etched", "reverse_holofoil", "non_holo", "holofoil"]))
      .toEqual(["non_holo", "holofoil", "reverse_holofoil", "gold_etched"]);
  });

  it("labels holo and reverse holo distinguishably in the UI", () => {
    expect(FINISH_LABELS.holofoil).toBe("Holo");
    expect(FINISH_LABELS.reverse_holofoil).toBe("Reverse Holo");
  });
});
