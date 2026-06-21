export type ProStatusFields = {
  is_pro?: boolean | null;
  pro_plan?: string | null;
  pro_expires_at?: string | null;
  pro_auto_renews?: boolean | null;
};

/**
 * True when the user is entitled to Pro *features* — active subscription OR a
 * one-time purchase still within its term. Mirrors the server `isPro()` check
 * but as a pure function for contexts that already have the profile fields
 * (avoids an extra query). Use this to gate features; use `isProSubscriber`
 * only for the paid-status badge.
 */
export function hasProAccess(p: ProStatusFields | null | undefined): boolean {
  if (!p?.is_pro) return false;
  // Non-renewing plans (one-time / cancelled) lose access once expired.
  if (!p.pro_auto_renews && p.pro_expires_at && new Date(p.pro_expires_at) < new Date()) return false;
  return true;
}

/**
 * True when the user is an active Pro *subscriber* — used to gate the Pro
 * badge/title shown across member-facing surfaces. One-time payers
 * (`pro_plan === "one_time"`) are intentionally excluded.
 *
 * Pure function: takes already-fetched profile fields so list/grid contexts
 * don't trigger an extra query per row (unlike the server-side `isPro` helper).
 */
export function isProSubscriber(p: ProStatusFields | null | undefined): boolean {
  if (!p?.is_pro || p.pro_plan !== "subscription") return false;
  // Guard against a stale subscription that failed to renew but still reads is_pro.
  if (p.pro_expires_at && new Date(p.pro_expires_at) < new Date()) return false;
  return true;
}
