import {
  formatDisplayName,
  isNameVisibility,
  isNewCollector,
  normalizeArea,
  rankCollectorMatches,
  sameArea,
  sanitizeCollectorQuery,
  toCollectorSummary,
} from "@/lib/collectors";

describe("sanitizeCollectorQuery", () => {
  it("trims and passes ordinary terms through", () => {
    expect(sanitizeCollectorQuery("  brandon  ")).toBe("brandon");
  });

  it("keeps the characters the quoted `or` filter can carry", () => {
    // A pasted city has to survive intact — stripping the comma would turn
    // "Boise, ID" into a term that matches nothing.
    expect(sanitizeCollectorQuery("Boise, ID")).toBe("Boise, ID");
    expect(sanitizeCollectorQuery("St. Paul (MN)")).toBe("St. Paul (MN)");
  });

  it("drops the characters that could escape the quoted value", () => {
    expect(sanitizeCollectorQuery('a"b')).toBe("ab");
    expect(sanitizeCollectorQuery("a\\b")).toBe("ab");
  });

  it("drops LIKE wildcards the caller supplies itself", () => {
    expect(sanitizeCollectorQuery("%admin%")).toBe("admin");
    expect(sanitizeCollectorQuery("*")).toBe("");
  });

  it("keeps underscores, which are legal in usernames", () => {
    expect(sanitizeCollectorQuery("brandon_m")).toBe("brandon_m");
  });

  it("caps the term length", () => {
    expect(sanitizeCollectorQuery("x".repeat(200))).toHaveLength(40);
  });
});

describe("formatDisplayName", () => {
  // These are the exact cases the `display_name_public` generated column was
  // verified against in Postgres. If the SQL changes, change these too.
  it.each([
    ["Brandon", "Miethe", "hidden", null],
    ["Brandon", "Miethe", "first", "Brandon"],
    ["Brandon", "Miethe", "first_initial", "Brandon M."],
    ["Brandon", "Miethe", "full", "Brandon Miethe"],
    ["  Ada  ", "  Lovelace ", "full", "Ada Lovelace"],
    ["Ada", null, "first_initial", "Ada"],
    ["Ada", "", "full", "Ada"],
    [null, "Miethe", "full", null],
    ["", "Miethe", "first", null],
  ] as const)("(%s, %s, %s) → %s", (first, last, visibility, expected) => {
    expect(formatDisplayName(first, last, visibility)).toBe(expected);
  });

  it("upper-cases the last initial", () => {
    expect(formatDisplayName("ada", "lovelace", "first_initial")).toBe("ada L.");
  });
});

describe("isNameVisibility", () => {
  it("accepts the four supported levels", () => {
    for (const v of ["hidden", "first", "first_initial", "full"]) {
      expect(isNameVisibility(v)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isNameVisibility("public")).toBe(false);
    expect(isNameVisibility(null)).toBe(false);
    expect(isNameVisibility(undefined)).toBe(false);
  });
});

describe("normalizeArea / sameArea", () => {
  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeArea("  Boise,   ID ")).toBe("boise id");
  });

  it("matches a city against the same city with a state", () => {
    expect(sameArea("Boise", "Boise, ID")).toBe(true);
    expect(sameArea("boise id", "Boise, ID")).toBe(true);
  });

  it("does not match different cities", () => {
    expect(sameArea("Boise, ID", "Chicago, IL")).toBe(false);
  });

  it("refuses to let a bare state code match every city in it", () => {
    expect(sameArea("Boise, ID", "ID")).toBe(false);
  });

  it("treats a missing location as no match", () => {
    expect(sameArea(null, "Boise")).toBe(false);
    expect(sameArea("Boise", "")).toBe(false);
  });
});

describe("rankCollectorMatches", () => {
  const rows = [
    { username: "zcollector" },
    { username: "goatfarm" },
    { username: "thegoat" },
    { username: "goat" },
  ];

  it("puts the exact match first, then prefix, then substring", () => {
    expect(rankCollectorMatches(rows, "goat").map((r) => r.username)).toEqual([
      "goat",
      "goatfarm",
      "thegoat",
      "zcollector",
    ]);
  });

  it("is case-insensitive", () => {
    expect(rankCollectorMatches(rows, "GOAT")[0].username).toBe("goat");
  });

  it("falls back to alphabetical within a tier", () => {
    const tied = [{ username: "beta" }, { username: "alpha" }];
    // Neither contains the term (they matched on city/specialty), so both land
    // in the last tier and sort by name.
    expect(rankCollectorMatches(tied, "boise").map((r) => r.username)).toEqual(["alpha", "beta"]);
  });

  it("does not mutate the input", () => {
    const input = [...rows];
    rankCollectorMatches(input, "goat");
    expect(input.map((r) => r.username)).toEqual(rows.map((r) => r.username));
  });

  it("ranks a public display name with the same precision as a handle", () => {
    const named = [
      { id: "a", username: "zzz", display_name_public: "Alexandra Reed" },
      { id: "b", username: "yyy", display_name_public: "Alex" },
    ];
    // "Alex" is exact on b, merely a prefix on a.
    expect(rankCollectorMatches(named, "alex").map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("never lets the social graph outrank an exact match", () => {
    // The whole reason relationship is a tiebreak rather than the outer sort:
    // your friend "goatfarm" must not bury the actual @goat.
    const ranked = rankCollectorMatches(
      [{ id: "friend", username: "goatfarm" }, { id: "target", username: "goat" }],
      "goat",
      { mutualIds: new Set(["friend"]) },
    );
    expect(ranked.map((r) => r.id)).toEqual(["target", "friend"]);
  });

  it("orders a relevance tier by mutual, then one-way follow, then alphabetical", () => {
    const tier = [
      { id: "stranger", username: "goat_c" },
      { id: "oneway", username: "goat_b" },
      { id: "mutual", username: "goat_a" },
    ];
    const ranked = rankCollectorMatches(tier, "goat", {
      mutualIds: new Set(["mutual"]),
      followIds: new Set(["oneway"]),
    });
    expect(ranked.map((r) => r.id)).toEqual(["mutual", "oneway", "stranger"]);
  });

  it("prefers a city matching the query over one matching the viewer's own city", () => {
    const tier = [
      { id: "neither", username: "aaa", city: "Austin, TX" },
      { id: "viewer-city", username: "bbb", city: "Denver, CO" },
      { id: "query-city", username: "ccc", city: "Boise, ID" },
    ];
    // All three matched on something other than handle/name, so relevance ties
    // and the location tiers decide.
    const ranked = rankCollectorMatches(tier, "boise", { viewerArea: "Denver, CO" });
    expect(ranked.map((r) => r.id)).toEqual(["query-city", "viewer-city", "neither"]);
  });

  it("collapses to pure relevance for a signed-out viewer", () => {
    const rowsWithCity = [
      { id: "b", username: "goatfarm", city: "Boise, ID" },
      { id: "a", username: "goat", city: "Austin, TX" },
    ];
    expect(rankCollectorMatches(rowsWithCity, "goat", {}).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("isNewCollector", () => {
  it("accepts a signup inside the window", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(isNewCollector(twoDaysAgo)).toBe(true);
  });

  it("rejects a signup outside the window", () => {
    const longAgo = new Date(Date.now() - 400 * 86_400_000).toISOString();
    expect(isNewCollector(longAgo)).toBe(false);
  });

  it("honours a custom window", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(isNewCollector(tenDaysAgo, 7)).toBe(false);
    expect(isNewCollector(tenDaysAgo, 30)).toBe(true);
  });
});

describe("toCollectorSummary", () => {
  const row = { id: "u1", username: "goat", created_at: "2026-01-01T00:00:00Z" };

  it("defaults every optional field and count", () => {
    expect(toCollectorSummary(row)).toEqual({
      id: "u1",
      username: "goat",
      display_name: null,
      created_at: "2026-01-01T00:00:00Z",
      city: null,
      specialty: null,
      avatar_url: null,
      avatar_color: null,
      is_pro: false,
      pro_plan: null,
      pro_expires_at: null,
      is_supporter: false,
      followers: 0,
      cards: 0,
      listings: 0,
    });
  });

  it("carries the counts it is given", () => {
    const summary = toCollectorSummary(row, { followers: 3, cards: 272, listings: 63 });
    expect(summary).toMatchObject({ followers: 3, cards: 272, listings: 63 });
  });

  it("fills in only the counts that are missing", () => {
    expect(toCollectorSummary(row, { cards: 5 })).toMatchObject({
      followers: 0,
      cards: 5,
      listings: 0,
    });
  });
});
