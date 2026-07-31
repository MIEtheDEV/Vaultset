import {
  RARITY_NONE,
  normalizeFilter,
  normalizeAction,
  describeAction,
  isFilterEmpty,
  BulkValidationError,
} from "@/lib/bulk/types";

// Bulk edit selects by predicate, so the filter and action descriptors are the
// only thing standing between an untrusted payload and a write across an entire
// collection. Server actions are directly callable — these run on hostile input.

describe("normalizeFilter", () => {
  it("drops empty axes so the SQL takes its unconstrained branch", () => {
    expect(normalizeFilter({ sets: [], rarities: [], conditions: [] })).toEqual({});
    expect(isFilterEmpty(normalizeFilter({}))).toBe(true);
  });

  it("keeps the no-rarity sentinel as a selectable value", () => {
    expect(normalizeFilter({ rarities: [RARITY_NONE] })).toEqual({ rarities: [RARITY_NONE] });
  });

  it("dedupes list entries", () => {
    expect(normalizeFilter({ sets: ["Pitch Black", "Pitch Black"] })).toEqual({ sets: ["Pitch Black"] });
  });

  it("preserves an explicit false tri-state rather than dropping it", () => {
    // forSale:false means "only cards NOT for sale" — dropping it as falsy
    // would silently widen the edit to the whole collection.
    expect(normalizeFilter({ forSale: false })).toEqual({ forSale: false });
    expect(normalizeFilter({ graded: false })).toEqual({ graded: false });
  });

  it("rejects an inverted value band", () => {
    expect(() => normalizeFilter({ minValue: 10, maxValue: 2 })).toThrow(BulkValidationError);
  });

  it("rejects a negative value bound", () => {
    expect(() => normalizeFilter({ minValue: -1 })).toThrow(BulkValidationError);
  });

  it("rejects non-string list entries", () => {
    expect(() => normalizeFilter({ sets: ["ok", 42] })).toThrow(BulkValidationError);
  });

  it("rejects a non-boolean tri-state", () => {
    expect(() => normalizeFilter({ forSale: "yes" })).toThrow(BulkValidationError);
  });

  it("rejects an over-long list", () => {
    expect(() => normalizeFilter({ sets: Array.from({ length: 501 }, (_, i) => `s${i}`) }))
      .toThrow(BulkValidationError);
  });

  it("rejects a non-object filter", () => {
    expect(() => normalizeFilter(null)).toThrow(BulkValidationError);
    expect(() => normalizeFilter([])).toThrow(BulkValidationError);
  });
});

describe("normalizeAction", () => {
  it("defaults rounding and floor on a price action", () => {
    expect(normalizeAction({ type: "price_market_pct", pct: -5 })).toEqual({
      type: "price_market_pct",
      pct: -5,
      floor: null,
      round: "cent",
    });
  });

  it("keeps an explicit floor and rounding mode", () => {
    expect(normalizeAction({ type: "price_list_pct", pct: 10, floor: 0.25, round: "ninety_nine" })).toEqual({
      type: "price_list_pct",
      pct: 10,
      floor: 0.25,
      round: "ninety_nine",
    });
  });

  it("rejects a percent that would collapse every price to the floor", () => {
    expect(() => normalizeAction({ type: "price_market_pct", pct: -100 })).toThrow(BulkValidationError);
  });

  it("rejects an out-of-range percent", () => {
    expect(() => normalizeAction({ type: "price_market_pct", pct: 5000 })).toThrow(BulkValidationError);
    expect(() => normalizeAction({ type: "price_market_pct", pct: NaN })).toThrow(BulkValidationError);
  });

  it("rejects an unknown rounding mode", () => {
    expect(() => normalizeAction({ type: "price_market_pct", pct: 0, round: "nearest_fiver" }))
      .toThrow(BulkValidationError);
  });

  it("requires a boolean on flag actions", () => {
    expect(normalizeAction({ type: "set_for_sale", value: true })).toEqual({ type: "set_for_sale", value: true });
    expect(() => normalizeAction({ type: "set_for_trade", value: "yes" })).toThrow(BulkValidationError);
  });

  it("rejects an unknown action type", () => {
    expect(() => normalizeAction({ type: "delete_everything" })).toThrow(BulkValidationError);
    expect(() => normalizeAction({})).toThrow(BulkValidationError);
  });
});

describe("describeAction", () => {
  it("signs the percent so the undo label reads unambiguously", () => {
    expect(describeAction({ type: "price_market_pct", pct: -5, floor: null, round: "cent" }))
      .toBe("Set price to market -5%");
    expect(describeAction({ type: "price_list_pct", pct: 10, floor: null, round: "cent" }))
      .toBe("Adjust current price by +10%");
  });

  it("describes flag actions in both directions", () => {
    expect(describeAction({ type: "set_for_sale", value: true })).toBe("List for sale");
    expect(describeAction({ type: "set_for_sale", value: false })).toBe("Unlist from sale");
  });
});
