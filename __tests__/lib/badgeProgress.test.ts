import { badgeMilestones, setMilestones, nextMilestones } from "@/lib/badgeProgress";
import type { BadgeStats, BadgeSlug } from "@/lib/badges";
import type { SetSummary } from "@/lib/sets/masterset";

const ZERO: BadgeStats = {
  totalCards: 0,
  activeListings: 0,
  forTradeCount: 0,
  gradedCount: 0,
  collectionValue: 0,
  followerCount: 0,
  followingCount: 0,
};

function set(over: Partial<SetSummary> & { setCode: string }): SetSummary {
  return {
    setName: `Set ${over.setCode}`,
    complete: { owned: 0, total: 100 },
    master: { owned: 0, total: 200 },
    hasPartial: false,
    ...over,
  } as SetSummary;
}

describe("badgeMilestones", () => {
  it("excludes badges already earned", () => {
    const stats = { ...ZERO, totalCards: 5 };
    const keys = badgeMilestones(stats, ["first_card"]).map((m) => m.key);

    expect(keys).not.toContain("badge:first_card");
    expect(keys).toContain("badge:collector");
  });

  it("excludes badges whose threshold is already met but not yet awarded", () => {
    // The award pass runs on dashboard load; between crossing a threshold and the
    // write landing, a met milestone must not be listed as outstanding.
    const stats = { ...ZERO, totalCards: 250 };
    const keys = badgeMilestones(stats, []).map((m) => m.key);

    expect(keys).not.toContain("badge:first_card");
    expect(keys).not.toContain("badge:collector");
    expect(keys).not.toContain("badge:century");
    expect(keys).toContain("badge:thousand");
  });

  it("reports current, target, remaining and percentage", () => {
    const m = badgeMilestones({ ...ZERO, totalCards: 73 }, ["first_card", "collector"])
      .find((x) => x.key === "badge:century")!;

    expect(m.current).toBe(73);
    expect(m.target).toBe(100);
    expect(m.remaining).toBe(27);
    expect(m.pct).toBeCloseTo(73);
  });

  it("rounds a fractional shortfall up, so remaining is never misleadingly low", () => {
    // $999.50 of $1,000 is $1 more in practice, not $0.
    const m = badgeMilestones({ ...ZERO, collectionValue: 999.5 }, [])
      .find((x) => x.key === "badge:high_roller")!;

    expect(m.remaining).toBe(1);
  });

  it("never reports a remaining count below 1", () => {
    for (const m of badgeMilestones({ ...ZERO, totalCards: 99.9 }, [])) {
      expect(m.remaining).toBeGreaterThanOrEqual(1);
    }
  });

  it("ranks nearest-to-complete first", () => {
    const stats = { ...ZERO, totalCards: 95, followingCount: 1 };
    const ms = badgeMilestones(stats, ["first_card", "collector"]);

    // 95/100 cards (95%) must outrank 1/5 follows (20%).
    expect(ms[0].key).toBe("badge:century");
  });

  it("keeps things the user controls above things they don't", () => {
    const stats = { ...ZERO, totalCards: 40 };
    const ms = badgeMilestones(stats, ["first_card", "collector"]);

    // 40/100 cards beats 0/1 followers, even though a follower is numerically closer.
    expect(ms[0].key).toBe("badge:century");
    expect(ms.map((m) => m.key).indexOf("badge:rising_star")).toBeGreaterThan(0);
  });

  it("carries display metadata so the hex badge art can be reused", () => {
    const m = badgeMilestones({ ...ZERO, totalCards: 50 }, ["first_card", "collector"])
      .find((x) => x.key === "badge:century")!;

    expect(m.slug).toBe("century");
    expect(m.label).toBe("Century");
    expect(m.color).toBeTruthy();
    expect(m.kind).toBe("badge");
  });

  it("returns every threshold for a brand-new account", () => {
    expect(badgeMilestones(ZERO, [])).toHaveLength(22);
  });

  it("returns nothing once everything is earned", () => {
    const all = badgeMilestones(ZERO, []).map((m) => m.slug as BadgeSlug);
    expect(badgeMilestones(ZERO, all)).toEqual([]);
  });
});

describe("setMilestones", () => {
  it("ignores sets the user has never started", () => {
    expect(setMilestones([set({ setCode: "base1" })])).toEqual([]);
  });

  it("ignores sets with no catalogued cards", () => {
    const s = set({ setCode: "ghost", complete: { owned: 0, total: 0 }, master: { owned: 0, total: 0 } });
    expect(setMilestones([s])).toEqual([]);
  });

  it("offers Complete Set while it is unfinished", () => {
    const s = set({ setCode: "base1", complete: { owned: 99, total: 102 } });
    const [m] = setMilestones([s]);

    expect(m.key).toBe("set:base1:complete");
    expect(m.remaining).toBe(3);
    expect(m.href).toBe("/masterset/base1");
    expect(m.kind).toBe("set");
  });

  it("switches to Master Set only once Complete Set is done", () => {
    const s = set({
      setCode: "base1",
      complete: { owned: 102, total: 102 },
      master: { owned: 140, total: 198 },
    });
    const [m] = setMilestones([s]);

    expect(m.key).toBe("set:base1:master");
    expect(m.remaining).toBe(58);
  });

  it("drops a fully-mastered set entirely", () => {
    const s = set({
      setCode: "base1",
      complete: { owned: 102, total: 102 },
      master: { owned: 198, total: 198 },
    });
    expect(setMilestones([s])).toEqual([]);
  });

  it("ranks the closest set first", () => {
    const near = set({ setCode: "near", complete: { owned: 96, total: 100 } });
    const far  = set({ setCode: "far",  complete: { owned: 10, total: 100 } });

    expect(setMilestones([far, near])[0].key).toBe("set:near:complete");
  });
});

describe("nextMilestones", () => {
  it("respects the limit", () => {
    expect(nextMilestones(ZERO, [], [], 3)).toHaveLength(3);
    expect(nextMilestones(ZERO, [], [], 1)).toHaveLength(1);
  });

  it("interleaves badge and set milestones by proximity", () => {
    const stats = { ...ZERO, totalCards: 30 };
    const s = set({ setCode: "base1", complete: { owned: 98, total: 100 } });

    // 98% set completion should lead a 30% badge.
    expect(nextMilestones(stats, ["first_card", "collector"], [s], 3)[0].key)
      .toBe("set:base1:complete");
  });

  it("always keeps one set milestone when any set is in progress", () => {
    // Four badges are all nearer than the set, but burying an in-progress set
    // defeats the strongest retention hook in the product.
    const stats = { ...ZERO, totalCards: 99, gradedCount: 24, followerCount: 49, followingCount: 24 };
    const s = set({ setCode: "base1", complete: { owned: 2, total: 100 } });

    const ms = nextMilestones(stats, ["first_card", "collector", "graded", "rising_star", "connected", "community"], [s], 3);

    expect(ms).toHaveLength(3);
    expect(ms.filter((m) => m.kind === "set")).toHaveLength(1);
    // The set takes the last slot, so the two nearest badges are preserved.
    expect(ms[ms.length - 1].kind).toBe("set");
    expect(ms[0].kind).toBe("badge");
  });

  it("does not fabricate a set slot when no set is in progress", () => {
    const ms = nextMilestones({ ...ZERO, totalCards: 50 }, ["first_card", "collector"], [], 3);
    expect(ms.every((m) => m.kind === "badge")).toBe(true);
  });

  it("returns an empty list when there is nothing left to chase", () => {
    const all = badgeMilestones(ZERO, []).map((m) => m.slug as BadgeSlug);
    expect(nextMilestones(ZERO, all, [], 3)).toEqual([]);
  });

  it("is stable across repeated calls with equal input", () => {
    const stats = { ...ZERO, totalCards: 10, followerCount: 1, followingCount: 1 };
    const a = nextMilestones(stats, [], [], 3).map((m) => m.key);
    const b = nextMilestones(stats, [], [], 3).map((m) => m.key);
    expect(a).toEqual(b);
  });
});
