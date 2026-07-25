import { selectChaseCards, isChaseEligible, CHASE_LIMIT, VALUE_MODE_MIN_COVERAGE } from "@/lib/sets/chaseCards";

interface Row { key: string; rarity: string | null; value: number | null; number: string | null }
const read = (c: Row) => ({ rarity: c.rarity, value: c.value, number: c.number, key: c.key });
const card = (o: Partial<Row> & { key: string }): Row => ({ rarity: "ultra_rare", value: null, number: null, ...o });
const pick = (cards: Row[]) => selectChaseCards(cards, read).map((c) => c.key);

describe("isChaseEligible", () => {
  it("accepts anything rarer than a plain rare", () => {
    for (const r of ["special_illustration_rare", "hyper_rare", "ultra_rare", "double_rare", "rare_holo"]) {
      expect(isChaseEligible(r)).toBe(true);
    }
  });
  it("rejects rare and below, and unmapped rarities", () => {
    for (const r of ["rare", "uncommon", "common"]) expect(isChaseEligible(r)).toBe(false);
    expect(isChaseEligible(null)).toBe(false);
  });
});

describe("selectChaseCards — value mode", () => {
  // The real Prismatic Evolutions case: five gold hyper rares worth $6-$64 vs the
  // $1,506 Umbreon ex SIR. Rarity order buries Umbreon; value order leads with it.
  const prismatic: Row[] = [
    { key: "sv8pt5-176", rarity: "hyper_rare", value: 5.72, number: "176" },
    { key: "sv8pt5-177", rarity: "hyper_rare", value: 9.98, number: "177" },
    { key: "sv8pt5-178", rarity: "hyper_rare", value: 5.99, number: "178" },
    { key: "sv8pt5-179", rarity: "hyper_rare", value: 63.99, number: "179" },
    { key: "sv8pt5-180", rarity: "hyper_rare", value: 10.27, number: "180" },
    { key: "sv8pt5-161", rarity: "special_illustration_rare", value: 1506.09, number: "161" },
    { key: "sv8pt5-156", rarity: "special_illustration_rare", value: 550.37, number: "156" },
  ];

  it("leads with the most valuable card, not the rarest tier", () => {
    expect(pick(prismatic).slice(0, 3)).toEqual(["sv8pt5-161", "sv8pt5-156", "sv8pt5-179"]);
  });

  it("caps the strip at CHASE_LIMIT", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      card({ key: `c${i}`, value: i, number: String(i) }));
    expect(pick(many)).toHaveLength(CHASE_LIMIT);
  });

  // 3 of 5 priced == exactly the coverage threshold, so this also pins the boundary.
  it("sorts unpriced cards to the tail even when they are the rarest", () => {
    const cards: Row[] = [
      card({ key: "u-hyper", rarity: "hyper_rare", value: null }),
      card({ key: "u-dr", rarity: "double_rare", value: null }),
      card({ key: "p-mid", rarity: "double_rare", value: 1 }),
      card({ key: "p-hi", rarity: "double_rare", value: 2 }),
      card({ key: "p-lo", rarity: "double_rare", value: 0.5 }),
    ];
    expect(3 / 5).toBeGreaterThanOrEqual(VALUE_MODE_MIN_COVERAGE);
    expect(pick(cards)).toEqual(["p-hi", "p-mid", "p-lo", "u-hyper", "u-dr"]);
  });
});

describe("selectChaseCards — rarity fallback", () => {
  // Below the coverage threshold, ranking by value would rank by which cards we
  // happened to warm. A thinly-priced set must ignore value entirely.
  it("ignores value when too little of the pool is priced", () => {
    const cards: Row[] = [
      card({ key: "cheap-but-priced", rarity: "double_rare", value: 2, number: "1" }),
      card({ key: "sir-unpriced", rarity: "special_illustration_rare", value: null, number: "2" }),
      card({ key: "hyper-unpriced", rarity: "hyper_rare", value: null, number: "3" }),
      card({ key: "ur-unpriced", rarity: "ultra_rare", value: null, number: "4" }),
      card({ key: "dr-unpriced", rarity: "double_rare", value: null, number: "5" }),
    ];
    expect(1 / 5).toBeLessThan(VALUE_MODE_MIN_COVERAGE);
    expect(pick(cards)[0]).toBe("hyper-unpriced");
    expect(pick(cards)).toEqual([
      "hyper-unpriced", "sir-unpriced", "ur-unpriced", "cheap-but-priced", "dr-unpriced",
    ]);
  });

  it("orders by collector number numerically within a rarity tier", () => {
    const cards: Row[] = [
      card({ key: "b", number: "100" }),
      card({ key: "a", number: "9" }),
    ];
    expect(pick(cards)).toEqual(["a", "b"]);
  });
});

describe("selectChaseCards — determinism", () => {
  it("never leaves two cards tied, in either mode", () => {
    for (const value of [null, 5]) {
      const cards: Row[] = [
        card({ key: "z", rarity: "ultra_rare", value, number: "1" }),
        card({ key: "a", rarity: "ultra_rare", value, number: "1" }),
      ];
      expect(pick(cards)).toEqual(["a", "z"]);
      expect(pick([...cards].reverse())).toEqual(["a", "z"]);
    }
  });

  it("returns an empty strip when nothing qualifies", () => {
    expect(pick([card({ key: "x", rarity: "rare" }), card({ key: "y", rarity: null })])).toEqual([]);
  });
});
