import { extractApiConditionStats, mergeConditionHistory } from "@/lib/pricing/cardHistory";

const day = (d: string, t = 0) => ({ p: t, t: Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000) });

const raw = {
  variants: [
    {
      printing: "Holofoil", condition: "Near Mint", price: 334.79,
      priceHistory: [{ ...day("2026-06-29"), p: 335.77 }, { ...day("2026-06-30"), p: 333.35 }],
    },
    {
      printing: "Holofoil", condition: "Damaged", price: 153.16,
      priceHistory: [{ ...day("2026-06-29"), p: 152.71 }],
    },
    // A different printing — must not leak into the Holofoil option list.
    { printing: "Reverse Holofoil", condition: "Near Mint", price: 99.99, priceHistory: [] },
    // Unrecognised condition — never offered.
    { printing: "Holofoil", condition: "Sealed", price: 500, priceHistory: [] },
  ],
};

describe("extractApiConditionStats", () => {
  it("offers only conditions that genuinely exist, at one finish", () => {
    const opts = extractApiConditionStats(raw, { finish: "holofoil", condition: "near_mint" });
    expect(opts.map((o) => o.conditionKey).sort()).toEqual(["damaged", "near_mint"]);
  });

  it("never invents a condition the source lacks", () => {
    // The naive approach (extractApiCardStats per condition) would fall back to a
    // different variant and report Near Mint's numbers as "Lightly Played".
    const opts = extractApiConditionStats(raw, { finish: "holofoil", condition: "near_mint" });
    expect(opts.find((o) => o.conditionKey === "lightly_played")).toBeUndefined();
  });

  it("keeps each condition's own price and history", () => {
    const opts = extractApiConditionStats(raw, { finish: "holofoil", condition: "near_mint" });
    const dmg = opts.find((o) => o.conditionKey === "damaged")!;
    expect(dmg.price).toBe(153.16);
    expect(dmg.points).toEqual([{ date: "2026-06-29", value: 152.71 }]);
  });

  it("returns nothing for a bedrock payload with no variants", () => {
    expect(extractApiConditionStats({ id: "base1-4" }, { finish: null, condition: "near_mint" })).toEqual([]);
    expect(extractApiConditionStats(null, { finish: null, condition: "near_mint" })).toEqual([]);
  });
});

describe("mergeConditionHistory", () => {
  const options = extractApiConditionStats(raw, { finish: "holofoil", condition: "near_mint" });

  it("appends our own snapshots to the provider's frozen window", () => {
    const own = new Map([["near_mint", [{ date: "2026-08-02", value: 334.79 }]]]);
    const nm = mergeConditionHistory(options, own).find((o) => o.conditionKey === "near_mint")!;
    expect(nm.points).toEqual([
      { date: "2026-06-29", value: 335.77 },
      { date: "2026-06-30", value: 333.35 },
      { date: "2026-08-02", value: 334.79 },
    ]);
  });

  it("lets our snapshot win on a shared day — it's what we actually recorded", () => {
    const own = new Map([["near_mint", [{ date: "2026-06-30", value: 999 }]]]);
    const nm = mergeConditionHistory(options, own).find((o) => o.conditionKey === "near_mint")!;
    expect(nm.points.find((p) => p.date === "2026-06-30")!.value).toBe(999);
  });

  it("keeps conditions separate — NM snapshots never bleed into DMG", () => {
    const own = new Map([["near_mint", [{ date: "2026-08-02", value: 334.79 }]]]);
    const dmg = mergeConditionHistory(options, own).find((o) => o.conditionKey === "damaged")!;
    expect(dmg.points).toEqual([{ date: "2026-06-29", value: 152.71 }]);
  });

  it("is a no-op when we have no snapshots yet", () => {
    expect(mergeConditionHistory(options, new Map())).toEqual(options);
  });

  it("returns points sorted oldest-first", () => {
    const own = new Map([["near_mint", [
      { date: "2026-08-02", value: 1 },
      { date: "2026-07-15", value: 2 },
    ]]]);
    const nm = mergeConditionHistory(options, own).find((o) => o.conditionKey === "near_mint")!;
    expect(nm.points.map((p) => p.date)).toEqual([...nm.points.map((p) => p.date)].sort());
  });
});
