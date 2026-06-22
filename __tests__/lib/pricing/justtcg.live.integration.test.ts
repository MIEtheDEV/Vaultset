/**
 * @jest-environment node
 *
 * LIVE integration test — hits the real JustTCG API using JUSTTCG_API_KEY from
 * .env.local. Opt-in only (costs 1 request, needs network), so it is skipped
 * unless RUN_LIVE_PRICING=1. This exercises the REAL JustTcgPriceProvider batch
 * path (the code we fixed), not a mock.
 *
 * Run it:   RUN_LIVE_PRICING=1 npx jest justtcg.live
 *
 * Expected on `fix/justtcg-batch-body`: PASS — prints real per-condition prices.
 * Expected on `main` (old { items } body): FAIL — API 400s, no payload returned.
 * That contrast is the proof the fix changed real behavior end-to-end.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { JustTcgPriceProvider } from "@/lib/pricing/JustTcgPriceProvider";
import type { FetchContext } from "@/lib/pricing/PriceProvider";

const run = process.env.RUN_LIVE_PRICING ? it : it.skip;

run("fetches real prices + per-condition data for a known tcgplayerId (live)", async () => {
  const provider = new JustTcgPriceProvider();
  expect(provider.isConfigured()).toBe(true); // JUSTTCG_API_KEY must be loaded

  const ctx: FetchContext = { allowResolve: false, recordRequest: async () => true };
  // 88075 = Pikachu, Legendary Collection (a stable, always-present card).
  const out = await provider.fetchBatch([{ apiId: "live-pika", tcgplayerId: "88075", name: "Pikachu" }], ctx);

  const payload = out.get("live-pika");
  // eslint-disable-next-line no-console
  console.log("LIVE JustTCG payload:", JSON.stringify(payload, null, 2));

  expect(payload).toBeDefined();                         // old { items } body => undefined here
  expect(payload!.tcgplayerId).toBe("88075");
  expect(Object.keys(payload!.prices).length).toBeGreaterThan(0);
  expect(payload!.conditionPrices).not.toBeNull();
  const finishes = Object.keys(payload!.conditionPrices!);
  expect(finishes.length).toBeGreaterThan(0);
  // At least one finish should carry a real Near Mint condition price.
  expect(finishes.some((f) => "near_mint" in payload!.conditionPrices![f])).toBe(true);
}, 20000);
