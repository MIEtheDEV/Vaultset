/**
 * Catalog price-warming job — standalone, scheduled, resumable.
 *
 * Prices the whole `cards` catalog in strict value order, bounded by the JustTCG
 * daily/monthly budget so it's safe to run repeatedly (e.g. once a day). Each run
 * grinds through the most valuable cards still needing work; a large catalog warms
 * over several days because the first-time resolve costs ~1 JustTCG request per
 * unmapped card.
 *
 * Priority (lower = sooner):
 *   1 owned & no-data & listed        4 owned & has-data & unlisted
 *   2 owned & no-data & unlisted      5 unowned & no-data
 *   3 owned & has-data & listed       6 unowned & has-data
 * Ownership primary, coverage (no-data before refresh) secondary, listed-for-sale
 * the finest tiebreaker within owned.
 *
 * Reuses the real pricing engine — no re-implementation — so results are cached to
 * card_prices + archived to card_price_snapshots exactly like the app's own paths.
 *
 * Usage:
 *   pnpm warm:catalog --dry-run     # print the priority queue, no API calls, no writes
 *   pnpm warm:catalog               # price up to the remaining daily JustTCG budget
 *   pnpm warm:catalog --max=250     # cap this run at 250 cards
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { CardRef } from "@/lib/pricing/PriceProvider";

// NOTE: the pricing modules are imported DYNAMICALLY inside main(), AFTER dotenv
// has loaded, on purpose. `lib/pricing/index.ts` constructs the providers at
// module-eval time and JustTcgPriceProvider reads its plan limits (daily cap,
// batch size, per-minute) from env IN ITS CONSTRUCTOR. ESM evaluates all static
// imports before any top-level code, so a static import here would build the
// provider with free-tier limits before JUSTTCG_API_KEY_PAID is set — silently
// capping the paid key at 100/day. Dynamic import guarantees env is live first.

const DRY_RUN = process.argv.includes("--dry-run");
const maxArg = process.argv.find((a) => a.startsWith("--max="))?.split("=")[1];

type CardRow = {
  id: string;
  name: string | null;
  set_name: string | null;
  set_code: string | null;
  card_number: string | null;
  game_data: Record<string, unknown> | null;
};

/** Page through a table (Supabase caps at 1000 rows/response). */
async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  // Dynamic imports — see the note at the top of the file (env must load first).
  const { createAdminClient }     = await import("@/utils/supabase/admin");
  const { PriceFetchEngine }      = await import("@/lib/pricing/PriceFetchEngine");
  const { propagateMarketValues } = await import("@/lib/pricing/propagateMarketValues");
  const { priceApiId }            = await import("@/lib/pricing/cardIdentity");
  const { justTcgLimits }         = await import("@/lib/pricing/justtcgTier");

  const db = createAdminClient();
  const limits = justTcgLimits();

  // Remaining JustTCG daily budget → default cap for this run (never queue more
  // paid work than today allows). --max overrides.
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await db
    .from("price_api_usage").select("request_count").eq("provider", "justtcg").eq("day", today).maybeSingle();
  const usedToday = usage?.request_count ?? 0;
  const remainingBudget = limits.dailyCap == null ? Infinity : Math.max(0, limits.dailyCap - usedToday);
  const max = maxArg ? Number(maxArg) : (remainingBudget === Infinity ? 5000 : remainingBudget);

  // Ownership + listing (from collection_items) and existing price coverage.
  const owned = new Set<string>();
  const listed = new Set<string>();
  const items = await fetchAll<{ card_id: string; for_sale: boolean | null }>((f, t) =>
    db.from("collection_items").select("card_id, for_sale").range(f, t));
  for (const it of items) { owned.add(it.card_id); if (it.for_sale) listed.add(it.card_id); }

  const pricedKeys = new Set<string>();
  const prices = await fetchAll<{ card_api_id: string }>((f, t) =>
    db.from("card_prices").select("card_api_id").range(f, t));
  for (const p of prices) pricedKeys.add(p.card_api_id);

  // All catalog cards → assign priority tier.
  const cards = await fetchAll<CardRow>((f, t) =>
    db.from("cards").select("id, name, set_name, set_code, card_number, game_data").range(f, t));

  // E2E-test leakage pollutes the catalog with unowned, externally-unidentified
  // cards ("E2E Card <ts>", "Edit Target", "Delete Me", "Test Card"). They can't
  // be priced and warming them just burns paid requests (JustTCG 500s on the junk
  // names), so skip them. Rule: an UNOWNED `manual:` card (no pokemon_api_id /
  // tcgplayer_id) has no real catalog identity → skip. Owned manual cards (a real
  // user hand-entered) are kept. A name-pattern check is a belt-and-suspenders.
  const TEST_NAME = /^(Test Card|E2E Card|Edit Target|Delete Me)\b/i;

  type Ranked = { tier: number; apiId: string; ref: CardRef };
  const ranked: Ranked[] = [];
  let skippedJunk = 0;
  for (const c of cards) {
    const apiId = priceApiId((c.game_data ?? {}) as Record<string, unknown>, c.id);
    if (!apiId) continue; // manual card with no id — nothing to query
    const isOwned = owned.has(c.id);
    if ((!isOwned && apiId.startsWith("manual:")) || TEST_NAME.test(c.name ?? "")) {
      skippedJunk++;
      continue;
    }
    const hasData = pricedKeys.has(apiId);
    const isListed = listed.has(c.id);
    const tier = isOwned
      ? (!hasData ? (isListed ? 1 : 2) : (isListed ? 3 : 4))
      : (!hasData ? 5 : 6);
    ranked.push({
      tier, apiId,
      ref: {
        apiId,
        tcgplayerId: ((c.game_data ?? {}).tcgplayer_id as string) ?? null,
        name: c.name ?? undefined,
        setName: c.set_name ?? undefined,
        setCode: c.set_code ?? undefined,
        number: c.card_number ?? undefined,
      },
    });
  }
  // Stable sort by tier; dedupe by apiId keeping the best (lowest) tier.
  ranked.sort((a, b) => a.tier - b.tier);
  const seen = new Set<string>();
  const queue = ranked.filter((r) => !seen.has(r.apiId) && seen.add(r.apiId));

  const dist = [1, 2, 3, 4, 5, 6].map((t) => queue.filter((r) => r.tier === t).length);
  console.log(`catalog=${cards.length} distinct-keys=${queue.length} owned=${owned.size} listed=${listed.size} priced=${pricedKeys.size} skippedJunk=${skippedJunk}`);
  console.log(`priority distribution: T1=${dist[0]} T2=${dist[1]} T3=${dist[2]} T4=${dist[3]} T5=${dist[4]} T6=${dist[5]}`);
  console.log(`justtcg tier: batch=${limits.batchSize} daily=${limits.dailyCap} monthly=${limits.monthlyCap} perMin=${limits.perMinute} | usedToday=${usedToday} remainingBudget=${remainingBudget}`);

  const slice = queue.slice(0, Math.max(0, Math.floor(max)));
  console.log(`${DRY_RUN ? "[DRY RUN] would process" : "processing"} ${slice.length} cards this run (max=${max})`);
  if (slice.length) {
    console.log(`  first 10: ${slice.slice(0, 10).map((r) => `T${r.tier} ${r.ref.name} #${r.ref.number}`).join(" | ")}`);
  }

  if (DRY_RUN) { console.log("[DRY RUN] no API calls, no writes."); return; }
  if (slice.length === 0) { console.log("Nothing to do (budget spent or catalog fully warm)."); return; }

  // Price in priority order via the real engine (bedrock-free first, then JustTCG
  // for gaps within budget), then fan values out to owning collection_items.
  const engine = new PriceFetchEngine(db);
  const resolved = await engine.getPricesGapAware(slice.map((r) => r.ref));
  const fresh = [...resolved.values()].filter((p) => !p.fromCache).map((p) => p.cardApiId);
  const updated = await propagateMarketValues(db, fresh);
  console.log(`done: resolved=${resolved.size} freshlyFetched=${fresh.length} collection_items updated=${updated}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
