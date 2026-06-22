import type { SupabaseClient } from "@supabase/supabase-js";

// Graded slab prices: { grader: { grade: usdMedian } }, e.g.
// { psa: { "9": 267.06, "10": 549.16 }, bgs: { "10": 857.59 } }.
export type GradedPrices = Record<string, Record<string, number>>;

const HOST = "cardmarket-api-tcg.p.rapidapi.com";
const FRESH_MS = 24 * 60 * 60 * 1000; // graded changes slowly + quota is tight
const DAILY_CAP = 100;                // RapidAPI plan: 100 requests/day
const MIN_SAMPLES = 2;                // ignore eBay medians from a single sale

interface EbayGradeStat { median_price?: number; sample_size?: number }
type EbayGraded = Record<string, Record<string, EbayGradeStat>>;

/** Keep only confident USD medians (>= MIN_SAMPLES) from the eBay graded block. */
function normalizeEbayGraded(ebay?: EbayGraded | null): GradedPrices {
  const out: GradedPrices = {};
  for (const [grader, byGrade] of Object.entries(ebay ?? {})) {
    for (const [grade, stat] of Object.entries(byGrade ?? {})) {
      if (stat?.median_price == null) continue;
      if ((stat.sample_size ?? 0) < MIN_SAMPLES) continue;
      (out[grader.toLowerCase()] ??= {})[grade] = stat.median_price;
    }
  }
  return out;
}

/** Has this card api id got a real tcgid we can look up? (synthetic keys don't) */
function hasTcgId(cardApiId: string): boolean {
  return !cardApiId.startsWith("tcg:") && !cardApiId.startsWith("manual:");
}

async function withinBudget(admin: SupabaseClient): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("price_api_usage")
    .select("request_count")
    .eq("provider", "tcggo")
    .eq("day", day)
    .maybeSingle();
  return (data?.request_count ?? 0) < DAILY_CAP;
}

async function bumpBudget(admin: SupabaseClient): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("price_api_usage")
    .select("request_count")
    .eq("provider", "tcggo")
    .eq("day", day)
    .maybeSingle();
  await admin
    .from("price_api_usage")
    .upsert({ provider: "tcggo", day, request_count: (data?.request_count ?? 0) + 1 }, { onConflict: "provider,day" });
}

/** Read cached graded prices for a card (no fetch). Used by fan-out/propagation. */
export async function readGradedPrices(
  admin: SupabaseClient,
  cardApiId: string,
): Promise<GradedPrices | null> {
  const { data } = await admin
    .from("card_graded_prices")
    .select("graded")
    .eq("card_api_id", cardApiId)
    .maybeSingle();
  return (data?.graded as GradedPrices) ?? null;
}

/**
 * Return graded prices for a card, fetching from cardmarket-api-tcg when the
 * cache is missing/stale and budget allows. Returns null when not applicable
 * (no API key, synthetic id, over budget with no cache, or no graded data).
 */
export async function ensureGradedPrices(
  admin: SupabaseClient,
  cardApiId: string,
): Promise<GradedPrices | null> {
  const key = process.env.TCGGO_RAPID_API_KEY;
  if (!key || !hasTcgId(cardApiId)) return null;

  const { data: row } = await admin
    .from("card_graded_prices")
    .select("graded, updated_at")
    .eq("card_api_id", cardApiId)
    .maybeSingle();

  if (row && Date.now() - new Date(row.updated_at).getTime() < FRESH_MS) {
    return (row.graded as GradedPrices) ?? null;
  }
  if (!(await withinBudget(admin))) {
    return (row?.graded as GradedPrices) ?? null; // serve stale rather than nothing
  }

  try {
    const res = await fetch(
      `https://${HOST}/pokemon/cards?tcgid=${encodeURIComponent(cardApiId)}`,
      { headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key } },
    );
    await bumpBudget(admin);
    if (!res.ok) {
      console.warn(`[pricing] graded (cardmarket-api-tcg): unexpected HTTP ${res.status} for ${cardApiId} — serving cached graded prices`);
      return (row?.graded as GradedPrices) ?? null;
    }

    const json = await res.json();
    const card = Array.isArray(json?.data) ? json.data[0] : json?.data;
    const graded = normalizeEbayGraded(card?.prices?.ebay?.graded);

    await admin
      .from("card_graded_prices")
      .upsert({ card_api_id: cardApiId, graded, updated_at: new Date().toISOString() }, { onConflict: "card_api_id" });
    return graded;
  } catch {
    return (row?.graded as GradedPrices) ?? null;
  }
}
