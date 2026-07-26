import {
  computeEarnedSlugs,
  BADGE_THRESHOLDS,
  BADGE_MAP,
  type BadgeStats,
  type BadgeSlug,
} from "@/lib/badges";

/**
 * Parity guard for the Phase 6.2 refactor that turned `computeEarnedSlugs`'s
 * if-chain into the `BADGE_THRESHOLDS` data table.
 *
 * `legacyComputeEarnedSlugs` below is the pre-refactor implementation, copied
 * verbatim. It is the oracle: the data-driven version must agree with it on every
 * input, including the exact ordering of the returned array. Do not "fix" this
 * copy — if it and the real implementation ever disagree, that is the bug this
 * file exists to catch.
 *
 * Getting this wrong would silently mis-award achievements, which is close to
 * unrecoverable: `awardBadges` upserts and never revokes, so a wrongly-granted
 * badge stays granted.
 */
function legacyComputeEarnedSlugs(stats: BadgeStats): BadgeSlug[] {
  const earned: BadgeSlug[] = [];
  // Collection size
  if (stats.totalCards >= 1)         earned.push("first_card");
  if (stats.totalCards >= 10)        earned.push("collector");
  if (stats.totalCards >= 100)       earned.push("century");
  if (stats.totalCards >= 1000)      earned.push("thousand");
  if (stats.totalCards >= 5000)      earned.push("crown_collector");
  // Collection value
  if (stats.collectionValue >= 1000)  earned.push("high_roller");
  if (stats.collectionValue >= 5000)  earned.push("portfolio_builder");
  if (stats.collectionValue >= 10000) earned.push("high_stakes");
  if (stats.collectionValue >= 50000) earned.push("vault_guardian");
  // Marketplace
  if (stats.activeListings >= 1)     earned.push("first_listing");
  if (stats.activeListings >= 5)     earned.push("active_seller");
  if (stats.activeListings >= 10)    earned.push("market_maker");
  // Trading
  if (stats.forTradeCount >= 1)      earned.push("trader");
  // Grading
  if (stats.gradedCount >= 1)        earned.push("graded");
  if (stats.gradedCount >= 10)       earned.push("grading_enthusiast");
  if (stats.gradedCount >= 25)       earned.push("grading_expert");
  // Social: followers
  if (stats.followerCount >= 1)      earned.push("rising_star");
  if (stats.followerCount >= 10)     earned.push("connected");
  if (stats.followerCount >= 50)     earned.push("popular");
  if (stats.followerCount >= 100)    earned.push("influencer");
  // Social: following
  if (stats.followingCount >= 5)     earned.push("community");
  if (stats.followingCount >= 25)    earned.push("connector");
  return earned;
}

const ZERO: BadgeStats = {
  totalCards: 0,
  activeListings: 0,
  forTradeCount: 0,
  gradedCount: 0,
  collectionValue: 0,
  followerCount: 0,
  followingCount: 0,
};

const STAT_KEYS = Object.keys(ZERO) as (keyof BadgeStats)[];

describe("computeEarnedSlugs — parity with the pre-refactor if-chain", () => {
  it("agrees on an all-zero account", () => {
    expect(computeEarnedSlugs(ZERO)).toEqual(legacyComputeEarnedSlugs(ZERO));
    expect(computeEarnedSlugs(ZERO)).toEqual([]);
  });

  it("agrees on every threshold boundary, one stat at a time", () => {
    // For each threshold, probe just below, exactly on, and just above it. Off-by-one
    // at a boundary is the single most likely way this refactor could go wrong.
    for (const { stat, threshold } of BADGE_THRESHOLDS) {
      for (const value of [threshold - 1, threshold, threshold + 1]) {
        const stats = { ...ZERO, [stat]: value };
        expect(computeEarnedSlugs(stats)).toEqual(legacyComputeEarnedSlugs(stats));
      }
    }
  });

  it("agrees when every stat is raised together across a wide sweep", () => {
    for (const v of [0, 1, 4, 5, 9, 10, 24, 25, 49, 50, 99, 100, 999, 1000, 4999, 5000, 9999, 10000, 49999, 50000, 123456]) {
      const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, v])) as unknown as BadgeStats;
      expect(computeEarnedSlugs(stats)).toEqual(legacyComputeEarnedSlugs(stats));
    }
  });

  it("agrees on pseudo-random combinations", () => {
    // Deterministic LCG rather than Math.random, so a failure is reproducible.
    let seed = 20260726;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let i = 0; i < 400; i++) {
      const stats = Object.fromEntries(
        STAT_KEYS.map((k) => [k, next(k === "collectionValue" ? 60000 : 6000)]),
      ) as unknown as BadgeStats;
      expect(computeEarnedSlugs(stats)).toEqual(legacyComputeEarnedSlugs(stats));
    }
  });

  it("agrees on fractional and negative values", () => {
    // collectionValue is a real dollar amount, so non-integers are the norm.
    for (const value of [-1, -0.01, 0.99, 999.99, 1000.01, 4999.995]) {
      const stats = { ...ZERO, collectionValue: value, totalCards: value };
      expect(computeEarnedSlugs(stats)).toEqual(legacyComputeEarnedSlugs(stats));
    }
  });

  it("returns slugs in the same order, not merely the same set", () => {
    const stats: BadgeStats = {
      totalCards: 6000,
      activeListings: 20,
      forTradeCount: 3,
      gradedCount: 30,
      collectionValue: 60000,
      followerCount: 150,
      followingCount: 30,
    };
    // Every count-derivable badge earned at once — the strictest ordering check.
    expect(computeEarnedSlugs(stats)).toEqual(legacyComputeEarnedSlugs(stats));
    expect(computeEarnedSlugs(stats)).toHaveLength(BADGE_THRESHOLDS.length);
  });
});

describe("BADGE_THRESHOLDS integrity", () => {
  it("covers exactly the 22 count-derivable badges", () => {
    expect(BADGE_THRESHOLDS).toHaveLength(22);
  });

  it("has no duplicate slugs", () => {
    const slugs = BADGE_THRESHOLDS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("references only slugs that have display metadata", () => {
    // A milestone with no BADGE_MAP entry would render as a blank hexagon.
    for (const { slug } of BADGE_THRESHOLDS) {
      expect(BADGE_MAP.get(slug)).toBeDefined();
    }
  });

  it("uses positive thresholds and known stat keys", () => {
    for (const { stat, threshold } of BADGE_THRESHOLDS) {
      expect(STAT_KEYS).toContain(stat);
      expect(threshold).toBeGreaterThan(0);
    }
  });

  it("orders each stat's tiers ascending", () => {
    // Milestone copy reads "N more to X"; a descending tier would make the next
    // milestone one the user already passed.
    const byStat = new Map<string, number[]>();
    for (const { stat, threshold } of BADGE_THRESHOLDS) {
      byStat.set(stat, [...(byStat.get(stat) ?? []), threshold]);
    }
    for (const [, tiers] of byStat) {
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    }
  });
});
