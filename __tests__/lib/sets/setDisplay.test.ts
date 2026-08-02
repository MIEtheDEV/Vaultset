import { splitSecretRares, tallyFinishes } from "@/lib/sets/setDisplay";

// The header has to explain why a 122-card set is a 198-printing master set.
// `tallyFinishes` is that explanation, so its counts must reconcile exactly with
// the master-set denominator (Σ finishes) the progress bar shows.

describe("splitSecretRares", () => {
  it("treats cards numbered above the printed total as secret rares", () => {
    // Chaos Rising: 122 tracked, 86 printed → 36 secrets.
    expect(splitSecretRares(122, 86)).toEqual({ regular: 86, secret: 36 });
  });

  it("reports no secrets when the set has no printed total to compare against", () => {
    expect(splitSecretRares(122)).toEqual({ regular: 122, secret: 0 });
  });

  it("never reports negative secrets when the printed total exceeds what we track", () => {
    // cel25c is short of its declared total; that must not invert the split.
    expect(splitSecretRares(22, 25)).toEqual({ regular: 22, secret: 0 });
  });
});

describe("tallyFinishes", () => {
  it("counts printings, not cards, so the tallies sum to the master total", () => {
    const cards = [
      { finishes: ["non_holo", "reverse_holofoil"] },
      { finishes: ["non_holo", "reverse_holofoil"] },
      { finishes: ["holofoil"] },
    ];
    const tally = tallyFinishes(cards);
    expect(tally.reduce((n, t) => n + t.count, 0)).toBe(5);
    expect(tally).toEqual([
      { finish: "non_holo", label: "Normal", count: 2 },
      { finish: "holofoil", label: "Holo", count: 1 },
      { finish: "reverse_holofoil", label: "Reverse Holo", count: 2 },
    ]);
  });

  it("reconciles with the real Chaos Rising breakdown", () => {
    // 38 common + 26 uncommon (normal + reverse), 12 rare (holo + reverse),
    // 11 IR + 10 double rare (holo), 18 UR + 6 SIR (textured), 1 mega hyper (gold).
    const cards = [
      ...Array(64).fill({ finishes: ["non_holo", "reverse_holofoil"] }),
      ...Array(12).fill({ finishes: ["holofoil", "reverse_holofoil"] }),
      ...Array(21).fill({ finishes: ["holofoil"] }),
      ...Array(24).fill({ finishes: ["textured_holofoil"] }),
      ...Array(1).fill({ finishes: ["gold_etched"] }),
    ];
    const tally = tallyFinishes(cards);
    expect(Object.fromEntries(tally.map((t) => [t.label, t.count]))).toEqual({
      "Normal": 64,
      "Holo": 33,
      "Reverse Holo": 76,
      "Textured": 24,
      "Gold": 1,
    });
    expect(tally.reduce((n, t) => n + t.count, 0)).toBe(198);
  });

  it("orders base → premium, not by frequency", () => {
    const tally = tallyFinishes([{ finishes: ["gold_etched", "reverse_holofoil", "non_holo"] }]);
    expect(tally.map((t) => t.finish)).toEqual(["non_holo", "reverse_holofoil", "gold_etched"]);
  });

  it("omits finishes the set doesn't have rather than listing them as zero", () => {
    expect(tallyFinishes([{ finishes: ["holofoil"] }]).map((t) => t.finish)).toEqual(["holofoil"]);
  });

  it("sorts an unlabelled finish to the end instead of dropping it", () => {
    // A new printing type should surface as itself, not vanish from the header.
    const tally = tallyFinishes([{ finishes: ["poke_ball_reverse", "non_holo"] }]);
    expect(tally.map((t) => t.finish)).toEqual(["non_holo", "poke_ball_reverse"]);
    expect(tally[1].label).toBe("poke_ball_reverse");
  });

  it("handles an empty set without inventing rows", () => {
    expect(tallyFinishes([])).toEqual([]);
  });
});
