// JustTCG plan limits. Source: https://justtcg.com/docs/rate-limits
//
// The tier is taken from JUSTTCG_TIER (starter|professional|enterprise); if unset
// it defaults to "starter" when a paid key (JUSTTCG_API_KEY_PAID) is present, else
// "free". These drive the engine's per-day and per-month budget guards, the batch
// size (POST /cards accepts ≤200), and the per-minute pacing used by bulk jobs.

export interface JustTcgLimits {
  /** Max cards per POST /cards batch. */
  batchSize: number;
  /** Requests per day; null = unlimited. */
  dailyCap: number | null;
  /** Requests per calendar month; null = unlimited. */
  monthlyCap: number | null;
  /** Requests per minute (used by bulk jobs to pace themselves under the 429 wall). */
  perMinute: number;
}

const TIERS: Record<string, JustTcgLimits> = {
  free:         { batchSize: 20,  dailyCap: 100,   monthlyCap: 1_000,   perMinute: 10 },
  starter:      { batchSize: 200, dailyCap: 1_000, monthlyCap: 10_000,  perMinute: 50 },
  professional: { batchSize: 200, dailyCap: 5_000, monthlyCap: 50_000,  perMinute: 100 },
  enterprise:   { batchSize: 200, dailyCap: 50_000, monthlyCap: 500_000, perMinute: 500 },
};

export function justTcgLimits(): JustTcgLimits {
  const hasPaidKey = !!process.env.JUSTTCG_API_KEY_PAID;
  const tier = (process.env.JUSTTCG_TIER || (hasPaidKey ? "starter" : "free")).toLowerCase();
  return TIERS[tier] ?? TIERS.free;
}
