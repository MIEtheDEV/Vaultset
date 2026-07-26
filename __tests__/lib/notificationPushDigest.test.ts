import { buildPushPayload, prefKeyForType } from "@/lib/notificationPush";

// Covers only the daily_digest branch added in Phase 6.1. The digest is the one
// notification the app sends unprompted, so its copy is the easiest place to ship
// an embarrassing sign error ("your vault is up -$4.00") to every user at once.

describe("prefKeyForType", () => {
  it("gates the digest on its own preference column", () => {
    expect(prefKeyForType("daily_digest")).toBe("push_digest");
  });

  it("still fails open for unmapped types", () => {
    expect(prefKeyForType("something_new")).toBeNull();
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

  it("names the leading mover when there is one", () => {
    const p = buildPushPayload(
      {
        type: "daily_digest",
        data: { change_abs: 30, change_pct: 4, leader_name: "Charizard ex", leader_pct: 8.24 },
      },
      null,
    );

    expect(p.body).toBe("Your vault is up $30.00 (+4.0%) today — led by Charizard ex (+8.2%)");
  });

  it("signs a declining leader correctly", () => {
    const p = buildPushPayload(
      {
        type: "daily_digest",
        data: { change_abs: -30, change_pct: -4, leader_name: "Umbreon VMAX", leader_pct: -9 },
      },
      null,
    );

    expect(p.body).toContain("led by Umbreon VMAX (−9.0%)");
  });

  it("omits the leader clause when the name is missing", () => {
    const p = buildPushPayload(
      { type: "daily_digest", data: { change_abs: 5, change_pct: 1, leader_pct: 3 } },
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
