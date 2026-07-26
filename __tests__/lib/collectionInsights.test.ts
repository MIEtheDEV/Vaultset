import { computeCollectionInsights, type InsightItem } from "@/lib/collectionInsights";

function item(over: Partial<InsightItem> = {}): InsightItem {
  return {
    quantity: 1,
    market_price: 10,
    condition: "near_mint",
    finish: "holofoil",
    grader: null,
    cards: {
      name: "Test Card",
      set_name: "Base Set",
      card_number: "1",
      image_url: null,
      game: "pokemon",
      game_data: { rarity: "rare" },
    },
    ...over,
  };
}

describe("computeCollectionInsights — totals", () => {
  it("counts physical copies, not inventory lines", () => {
    const r = computeCollectionInsights([item({ quantity: 4 }), item({ quantity: 2 })]);

    expect(r.totalCopies).toBe(6);
    expect(r.uniqueLines).toBe(2);
  });

  it("treats a null quantity as one copy", () => {
    expect(computeCollectionInsights([item({ quantity: null })]).totalCopies).toBe(1);
  });

  it("multiplies value by quantity", () => {
    expect(computeCollectionInsights([item({ quantity: 3, market_price: 12.5 })]).totalValue)
      .toBeCloseTo(37.5);
  });

  it("tracks priced copies separately so value coverage can be stated honestly", () => {
    const r = computeCollectionInsights([
      item({ quantity: 2, market_price: 5 }),
      item({ quantity: 3, market_price: null }),
    ]);

    expect(r.totalCopies).toBe(5);
    expect(r.pricedCopies).toBe(2);
    expect(r.totalValue).toBeCloseTo(10);
  });

  it("reports graded copies as a share of all copies", () => {
    const r = computeCollectionInsights([
      item({ quantity: 1, grader: "PSA" }),
      item({ quantity: 3, grader: null }),
    ]);

    expect(r.gradedCopies).toBe(1);
    expect(r.gradedPct).toBeCloseTo(25);
  });

  it("handles an empty collection without dividing by zero", () => {
    const r = computeCollectionInsights([]);

    expect(r).toMatchObject({ totalCopies: 0, totalValue: 0, gradedPct: 0, uniqueSets: 0 });
    expect(r.byRarity).toEqual([]);
    expect(r.concentration.pct).toBe(0);
  });
});

describe("computeCollectionInsights — rarity", () => {
  it("orders rarities by the rarity system's tier order, not by count", () => {
    // Three commons, one secret rare. The rarity system numbers rarer tiers LOWER
    // (common 17, secret_rare 4), so ascending rank is rarest-first — the same
    // convention as the inventory grid's "Rarity (highest first)" sort. Count must
    // not override it.
    const items = [
      ...Array.from({ length: 3 }, () =>
        item({ cards: { ...item().cards as object, game_data: { rarity: "common" } } as never }),
      ),
      item({ cards: { ...item().cards as object, game_data: { rarity: "secret_rare" } } as never }),
    ];

    const keys = computeCollectionInsights(items).byRarity.map((s) => s.key);
    expect(keys).toEqual(["secret_rare", "common"]);
  });

  it("buckets cards with no recorded rarity separately, and sorts them last", () => {
    const items = [
      item({ cards: { ...item().cards as object, game_data: {} } as never }),
      item({ cards: { ...item().cards as object, game_data: { rarity: "common" } } as never }),
    ];

    const slices = computeCollectionInsights(items).byRarity;
    expect(slices[slices.length - 1].key).toBe("__unknown");
    expect(slices[slices.length - 1].label).toBe("Unrecorded");
  });

  it("gives each rarity a rank so an ordinal colour ramp can be applied", () => {
    const items = [
      item({ cards: { ...item().cards as object, game_data: { rarity: "common" } } as never }),
      item({ cards: { ...item().cards as object, game_data: { rarity: "rare" } } as never }),
    ];

    const ranks = computeCollectionInsights(items).byRarity.map((s) => s.rank);
    expect(ranks[0]).toBeLessThan(ranks[1]);
  });

  it("shares add up to 100% when every card has a rarity", () => {
    const items = [
      item({ quantity: 3, cards: { ...item().cards as object, game_data: { rarity: "common" } } as never }),
      item({ quantity: 1, cards: { ...item().cards as object, game_data: { rarity: "rare" } } as never }),
    ];

    const total = computeCollectionInsights(items).byRarity.reduce((s, x) => s + x.pct, 0);
    expect(total).toBeCloseTo(100);
  });
});

describe("computeCollectionInsights — sets", () => {
  function inSet(set: string, quantity = 1): InsightItem {
    return item({ quantity, cards: { ...(item().cards as object), set_name: set } as never });
  }

  it("ranks sets by copies held, biggest first", () => {
    const r = computeCollectionInsights([inSet("Small", 1), inSet("Big", 9), inSet("Middle", 4)]);
    expect(r.bySet.map((s) => s.label)).toEqual(["Big", "Middle", "Small"]);
  });

  it("caps the list and does not invent an Other bar", () => {
    // An "Other" entry in a biggest-sets chart reads as if it were a set.
    const items = Array.from({ length: 12 }, (_, i) => inSet(`Set ${i}`, 12 - i));
    const r = computeCollectionInsights(items, { maxSets: 8 });

    expect(r.bySet).toHaveLength(8);
    expect(r.bySet.map((s) => s.label)).not.toContain("Other");
    // uniqueSets still reflects the true total, so the page can say what was omitted.
    expect(r.uniqueSets).toBe(12);
  });

  it("ignores blank set names", () => {
    const r = computeCollectionInsights([
      item({ cards: { ...(item().cards as object), set_name: "   " } as never }),
    ]);
    expect(r.bySet).toEqual([]);
    expect(r.uniqueSets).toBe(0);
  });
});

describe("computeCollectionInsights — condition and finish", () => {
  it("orders conditions best to worst regardless of input order", () => {
    const r = computeCollectionInsights([
      item({ condition: "damaged" }),
      item({ condition: "mint" }),
      item({ condition: "lightly_played" }),
    ]);

    expect(r.byCondition.map((s) => s.key)).toEqual(["mint", "lightly_played", "damaged"]);
  });

  it("puts an unrecognised condition after the known ones", () => {
    const r = computeCollectionInsights([
      item({ condition: "sealed_somehow" }),
      item({ condition: "mint" }),
    ]);
    expect(r.byCondition[0].key).toBe("mint");
    expect(r.byCondition[1].label).toBe("Sealed Somehow");
  });

  it("orders finishes by frequency, since finish has no natural sequence", () => {
    const r = computeCollectionInsights([
      item({ finish: "non_holo" }),
      item({ finish: "holofoil", quantity: 5 }),
    ]);
    expect(r.byFinish[0].key).toBe("holofoil");
  });

  it("skips items with no condition or finish rather than inventing a bucket", () => {
    const r = computeCollectionInsights([item({ condition: null, finish: null })]);
    expect(r.byCondition).toEqual([]);
    expect(r.byFinish).toEqual([]);
  });
});

describe("computeCollectionInsights — value concentration", () => {
  it("reports the top lines' share of total value", () => {
    const r = computeCollectionInsights(
      [
        item({ market_price: 600 }),
        item({ market_price: 300 }),
        item({ market_price: 50 }),
        item({ market_price: 50 }),
      ],
      { topN: 2 },
    );

    expect(r.totalValue).toBeCloseTo(1000);
    expect(r.concentration.pct).toBeCloseTo(90);
    expect(r.concentration.cards).toHaveLength(2);
    expect(r.concentration.cards[0].value).toBeCloseTo(600);
    expect(r.concentration.cards[0].pct).toBeCloseTo(60);
  });

  it("ranks by quantity-weighted value, not unit price", () => {
    const r = computeCollectionInsights(
      [item({ market_price: 100, quantity: 1 }), item({ market_price: 40, quantity: 5 })],
      { topN: 1 },
    );
    // 40 x 5 = 200 beats 100 x 1.
    expect(r.concentration.cards[0].value).toBeCloseTo(200);
  });

  it("excludes unpriced lines from the top list", () => {
    const r = computeCollectionInsights(
      [item({ market_price: null }), item({ market_price: 25 })],
      { topN: 5 },
    );
    expect(r.concentration.cards).toHaveLength(1);
  });

  it("caps concentration at 100% when everything is in the top N", () => {
    const r = computeCollectionInsights([item({ market_price: 10 })], { topN: 5 });
    expect(r.concentration.pct).toBeCloseTo(100);
  });

  it("survives a collection with no prices at all", () => {
    const r = computeCollectionInsights([item({ market_price: null })], { topN: 5 });
    expect(r.concentration.pct).toBe(0);
    expect(r.concentration.cards).toEqual([]);
  });

  it("labels a card with no name rather than rendering a blank row", () => {
    const r = computeCollectionInsights(
      [item({ cards: { ...(item().cards as object), name: null } as never })],
      { topN: 1 },
    );
    expect(r.concentration.cards[0].name).toBe("Unknown card");
  });

  it("tolerates a missing card relation entirely", () => {
    const r = computeCollectionInsights([item({ cards: null })]);
    expect(r.totalCopies).toBe(1);
    expect(r.byRarity[0].key).toBe("__unknown");
  });
});
