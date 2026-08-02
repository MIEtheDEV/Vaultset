import { invertedConditions, CONDITION_RANK } from "@/lib/pricing/conditionAnomaly";

describe("invertedConditions", () => {
  it("flags nothing on a normal descending ladder", () => {
    expect(invertedConditions({
      near_mint: 334.79, lightly_played: 262.77, moderately_played: 203.15,
      heavily_played: 176.41, damaged: 153.16,
    }).size).toBe(0);
  });

  it("flags a condition priced above Near Mint", () => {
    // me5-43 Normal, real data: NM $0.04 / LP $0.10.
    expect([...invertedConditions({ near_mint: 0.04, lightly_played: 0.1 })])
      .toEqual(["lightly_played"]);
  });

  it("ignores equal prices — common on cheap cards, and not a signal", () => {
    // me5-43 Reverse Holofoil, real data: both $0.18.
    expect(invertedConditions({ near_mint: 0.18, lightly_played: 0.18 }).size).toBe(0);
  });

  it("flags against any better grade, not just the one directly above", () => {
    // MP beats NM but sits under LP — still inverted, because a better grade is cheaper.
    const out = invertedConditions({ near_mint: 10, lightly_played: 30, moderately_played: 20 });
    expect([...out].sort()).toEqual(["lightly_played", "moderately_played"]);
  });

  it("never flags near_mint — nothing outranks it", () => {
    expect(invertedConditions({ near_mint: 999, lightly_played: 1 }).has("near_mint")).toBe(false);
  });

  it("skips missing conditions instead of treating them as zero", () => {
    expect(invertedConditions({
      near_mint: 5, lightly_played: null, moderately_played: undefined, damaged: 3,
    }).size).toBe(0);
  });

  it("handles a card with only one priced condition", () => {
    expect(invertedConditions({ near_mint: 5 }).size).toBe(0);
    expect(invertedConditions({ damaged: 5 }).size).toBe(0);
  });

  it("ignores unknown keys", () => {
    expect(invertedConditions({ near_mint: 1, sealed: 99 } as Record<string, number>).size).toBe(0);
  });

  it("ranks conditions best to worst", () => {
    expect(CONDITION_RANK[0]).toBe("near_mint");
    expect(CONDITION_RANK[CONDITION_RANK.length - 1]).toBe("damaged");
  });
});
