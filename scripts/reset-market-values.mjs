// One-off maintenance: clear all market values + the shared pricing cache so a
// fresh sync re-resolves everything with the corrected JustTCG matching.
// Run:  node --env-file=.env.local scripts/reset-market-values.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

// 1. How many market values exist right now (all users).
const { count: before } = await db
  .from("collection_items")
  .select("id", { count: "exact", head: true })
  .not("market_price", "is", null);

// 2. Null every market value (filter matches all rows — id is never null).
const { error: nullErr, count: nulled } = await db
  .from("collection_items")
  .update({ market_price: null }, { count: "exact" })
  .not("id", "is", null);
if (nullErr) { console.error("null market_price failed:", nullErr.message); process.exit(1); }

// 3. Clear the shared price cache so resolution starts fresh.
const { count: cacheBefore } = await db
  .from("card_prices")
  .select("card_api_id", { count: "exact", head: true });
const { error: cpErr } = await db.from("card_prices").delete().not("card_api_id", "is", null);
if (cpErr) { console.error("clear card_prices failed:", cpErr.message); process.exit(1); }

// 4. Reset today's request budget so the test sync isn't pre-throttled.
const { error: usageErr } = await db.from("price_api_usage").delete().not("provider", "is", null);
if (usageErr) { console.error("clear price_api_usage failed:", usageErr.message); process.exit(1); }

console.log("✓ Reset complete");
console.log(`  market_price nulled:   ${nulled ?? before} (was ${before} non-null, all users)`);
console.log(`  card_prices cleared:   ${cacheBefore} rows`);
console.log(`  price_api_usage:       cleared`);
