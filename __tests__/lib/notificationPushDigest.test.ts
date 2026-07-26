import { buildPushPayload, prefKeyForType } from "@/lib/notificationPush";

// Covers only the daily_digest branch added in Phase 6.1. The digest is the one
// notification the app sends unprompted, so its copy is the easiest place to ship
// an embarrassing sign error ("your vault is up -$4.00") to every user at once.

describe("prefKeyForType", () => {
  it("gates the digest on its own preference column", () => {
    expect(prefKeyForType("daily_digest")).toBe("push_digest");
  });

  it("gates the activation nudge on the same preference as the digest", () => {
    // Both are outreach we initiate; muting one should mute the other.
    expect(prefKeyForType("onboarding_nudge")).toBe("push_digest");
  });

  it("still fails open for unmapped types", () => {
    expect(prefKeyForType("something_new")).toBeNull();
  });
});

describe("buildPushPayload — onboarding_nudge", () => {
  it("points at the add-card page rather than the empty inventory list", () => {
    const p = buildPushPayload({ type: "onboarding_nudge", data: { age_days: 3 } }, null);

    expect(p.url).toBe("/inventory/add");
    expect(p.tag).toBe("onboarding_nudge");
    expect(p.body.length).toBeGreaterThan(0);
  });
});

describe("buildPushPayload — daily_digest", () => {
  it("phrases a gain as up, with a plus sign", () => {
    const p = buildPushPayload(
      { type: "daily_digest", data: { change_abs: 12.4, change_pct: 2.13 } },
      null,
    );

    expect(p.title).toContain("up");
    expect(p.body).toBe("Your vault is up $12.40 (+2.1%) today");
    expect(p.url).toBe("/dashboard");
  });

  it("phrases a loss as down, and never prints a doubled minus sign", () => {
    const p = buildPushPayload(
      { type: "daily_digest", data: { change_abs: -8.05, change_pct: -1.5 } },
      null,
    );

    expect(p.title).toContain("down");
    expect(p.body).toBe("Your vault is down $8.05 (−1.5%) today");
    expect(p.body).not.toContain("-$-");
    expect(p.body).not.toContain("−−");
  });

  it("names the leading mover in dollars, not percent", () => {
    const p = buildPushPayload(
      {
        type: "daily_digest",
        data: { change_abs: 30, change_pct: 4, leader_name: "Charizard ex", leader_abs: 12.5 },
      },
      null,
    );

    expect(p.body).toBe("Your vault is up $30.00 (+4.0%) today — led by Charizard ex (+$12.50)");
  });

  it("never quotes a leader percentage, however dramatic", () => {
    // A 20p energy card doubling is a real +228% that contributed 16p. Quoting the
    // percentage would be accurate and completely misleading at once — this is a
    // regression guard for exactly that, seen in real production data.
    const p = buildPushPayload(
      {
        type: "daily_digest",
        data: { change_abs: 1.07, change_pct: 0.65, leader_name: "Telepathic Psychic Energy", leader_abs: 0.16 },
      },
      null,
    );

    expect(p.body).toBe(
      "Your vault is up $1.07 (+0.7%) today — led by Telepathic Psychic Energy (+$0.16)",
    );
    // The portfolio headline keeps its percentage; the leader clause must not have one.
    const leaderClause = p.body.slice(p.body.indexOf("led by"));
    expect(leaderClause).not.toContain("%");
    expect(p.body).not.toContain("228");
  });

  it("signs a declining leader correctly", () => {
    const p = buildPushPayload(
      {
        type: "daily_digest",
        data: { change_abs: -30, change_pct: -4, leader_name: "Umbreon VMAX", leader_abs: -9 },
      },
      null,
    );

    expect(p.body).toContain("led by Umbreon VMAX (−$9.00)");
  });

  it("omits the leader clause when the name is missing", () => {
    const p = buildPushPayload(
      { type: "daily_digest", data: { change_abs: 5, change_pct: 1, leader_abs: 3 } },
      null,
    );

    expect(p.body).not.toContain("led by");
  });

  it("collapses to a single daily tag so an offline device doesn't stack digests", () => {
    const a = buildPushPayload({ type: "daily_digest", data: { change_abs: 1, change_pct: 1 } }, null);
    const b = buildPushPayload({ type: "daily_digest", data: { change_abs: 2, change_pct: 2 } }, null);

    expect(a.tag).toBe("daily_digest");
    expect(b.tag).toBe(a.tag);
  });

  it("survives a payload with no data at all", () => {
    const p = buildPushPayload({ type: "daily_digest" }, null);
    expect(p.body).toBe("Your vault is up $0.00 (+0.0%) today");
  });
});
