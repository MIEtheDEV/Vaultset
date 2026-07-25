import { deriveIsEx, isPromoCard } from "@/lib/cards/cardTraits";

describe("deriveIsEx", () => {
  it("uses subtypes when present", () => {
    expect(deriveIsEx("Charizard", ["Stage 2", "ex"])).toBe(true);
    expect(deriveIsEx("Charizard", ["VMAX"])).toBe(true);
    expect(deriveIsEx("Pikachu", ["Basic"])).toBe(false);
  });

  it("infers from the name suffix when subtypes are absent", () => {
    expect(deriveIsEx("Charizard ex")).toBe(true);
    expect(deriveIsEx("M Rayquaza EX")).toBe(true);
    expect(deriveIsEx("Pikachu GX")).toBe(true);
    expect(deriveIsEx("Zacian V")).toBe(true);
    expect(deriveIsEx("Charizard VMAX")).toBe(true);
    expect(deriveIsEx("Arceus VSTAR")).toBe(true);
  });

  it("does not flag ordinary cards", () => {
    expect(deriveIsEx("Charizard")).toBe(false);
    expect(deriveIsEx("Professor's Research")).toBe(false);
    expect(deriveIsEx("Mewtwo")).toBe(false);
  });
});

describe("isPromoCard", () => {
  it("detects promo from the set name", () => {
    expect(isPromoCard("SV Black Star Promos")).toBe(true);
    expect(isPromoCard("Scarlet & Violet Black Star Promos", "rare")).toBe(true);
  });

  it("detects promo from an already-mapped rarity key", () => {
    expect(isPromoCard("Base Set", "promo")).toBe(true);
  });

  it("returns false for ordinary cards", () => {
    expect(isPromoCard("Surging Sparks", "double_rare")).toBe(false);
    expect(isPromoCard("Base Set")).toBe(false);
  });
});
