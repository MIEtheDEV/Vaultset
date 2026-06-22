import { hasProAccess, isProSubscriber } from "@/lib/proStatus";

// Regression guard for the paywall-enforcement work (VS leak fixes). Every Pro
// gate ultimately routes through this entitlement decision, so the edge cases
// that let access "leak" must stay locked: expired one-time payers and stale
// subscriptions must lose access, while active/auto-renewing plans keep it.

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();
const PAST = new Date(Date.now() - 7 * 864e5).toISOString();

describe("hasProAccess — feature entitlement", () => {
  it("denies a free user (no is_pro)", () => {
    expect(hasProAccess(null)).toBe(false);
    expect(hasProAccess(undefined)).toBe(false);
    expect(hasProAccess({ is_pro: false })).toBe(false);
  });

  it("grants an active subscriber", () => {
    expect(hasProAccess({ is_pro: true, pro_plan: "subscription", pro_auto_renews: true, pro_expires_at: FUTURE })).toBe(true);
  });

  it("grants a one-time payer still within term", () => {
    expect(hasProAccess({ is_pro: true, pro_plan: "one_time", pro_auto_renews: false, pro_expires_at: FUTURE })).toBe(true);
  });

  it("denies a one-time payer whose term has expired", () => {
    expect(hasProAccess({ is_pro: true, pro_plan: "one_time", pro_auto_renews: false, pro_expires_at: PAST })).toBe(false);
  });

  it("keeps access for an auto-renewing plan even past the stored expiry", () => {
    // Renewal moves the date forward; a momentarily-stale date must not revoke access.
    expect(hasProAccess({ is_pro: true, pro_plan: "subscription", pro_auto_renews: true, pro_expires_at: PAST })).toBe(true);
  });
});

describe("isProSubscriber — badge display", () => {
  it("shows the badge only for an active subscription", () => {
    expect(isProSubscriber({ is_pro: true, pro_plan: "subscription", pro_expires_at: FUTURE })).toBe(true);
  });

  it("excludes one-time payers from the badge", () => {
    expect(isProSubscriber({ is_pro: true, pro_plan: "one_time", pro_expires_at: FUTURE })).toBe(false);
  });

  it("hides the badge for a stale (expired) subscription", () => {
    expect(isProSubscriber({ is_pro: true, pro_plan: "subscription", pro_expires_at: PAST })).toBe(false);
  });

  it("denies free users", () => {
    expect(isProSubscriber(null)).toBe(false);
    expect(isProSubscriber({ is_pro: false, pro_plan: "subscription" })).toBe(false);
  });
});
