/**
 * Whole-checklist bedrock price sweep — standalone, uncapped, resumable.
 *
 * Prices every card in the `set_cards` checklist (~18.7k) using ONLY the free,
 * uncapped pokemontcg.io tier — 50 ids per request, ~374 requests for the lot,
 * zero JustTCG quota spent.
 *
 * This is the coverage workhorse. `warm:catalog` can only reach the ~1.7k cards
 * in the `cards` table, and `warm:set` caps its per-run card count at the
 * remaining JustTCG *request* budget — so neither can fill the public hubs.
 * Run this first; let JustTCG spend its budget on owned / high-value cards where
 * real-time and per-condition pricing actually matters.
 *
 * Already-priced cards are skipped, so it's safe to re-run and it resumes after
 * an interrupt. Use --refresh to re-price everything (the engine still serves
 * anything under 6h old from cache, so that's cheaper than it sounds).
 *
 * Usage:
 *   pnpm warm:bedrock --dry-run          # counts + request estimate, no calls
 *   pnpm warm:bedrock                    # fill every gap in the checklist
 *   pnpm warm:bedrock --max=500          # cap this run at 500 cards
 *   pnpm warm:bedrock --set=me5,sv10     # restrict to specific sets
 *   pnpm warm:bedrock --refresh          # re-price already-cached cards too
 *   pnpm warm:bedrock --delay=500        # ms between slices (default 250)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Pricing modules are imported DYNAMICALLY inside main(), AFTER dotenv loads —
// lib/pricing/index.ts builds the providers at module-eval time and
// JustTcgPriceProvider reads its plan limits from env in its constructor. See
// scripts/warmCatalog.ts for the full explanation.

const arg = (name: string): string | undefined => {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=");
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const DRY_RUN = process.argv.includes("--dry-run");
const REFRESH = process.argv.includes("--refresh");
const maxArg = arg("max");
const setArg = arg("set");
const delayArg = arg("delay");

async function main() {
  const { createAdminClient }  = await import("@/utils/supabase/admin");
  const { sweepBedrockPrices } = await import("@/lib/pricing/sweepBedrockPrices");

  if (!process.env.POKEMON_TCG_API_KEY) {
    console.log("note: POKEMON_TCG_API_KEY unset — pokemontcg.io still works, at a lower rate limit.");
  }

  const started = Date.now();
  const r = await sweepBedrockPrices(createAdminClient(), {
    max: maxArg ? Number(maxArg) : undefined,
    setCodes: setArg ? setArg.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    refresh: REFRESH,
    delayMs: delayArg ? Number(delayArg) : undefined,
    dryRun: DRY_RUN,
    log: console.log,
  });

  if (DRY_RUN) {
    console.log(`[DRY RUN] would process ${Math.min(r.candidates, maxArg ? Number(maxArg) : r.candidates)} card(s); no calls made, nothing written.`);
    return;
  }

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `done in ${secs}s: processed ${r.processed}, freshly priced ${r.freshlyFetched}, ` +
    `no upstream price ${r.unresolved}, collection_items updated ${r.itemsUpdated}, ` +
    `bedrock requests ${r.requests}${r.retries ? ` (${r.retries} retried)` : ""}`,
  );
  if (r.unresolvedBySet.length) {
    const top = r.unresolvedBySet.slice(0, 8).map((s) => `${s.setCode}:${s.count}`).join("  ");
    console.log(`no bedrock price, by set: ${top}${r.unresolvedBySet.length > 8 ? "  …" : ""}`);
    console.log("  ^ a set with NO priced cards is one pokemontcg.io hasn't caught up on — use");
    console.log("    `pnpm warm:set --set <code>` (JustTCG) for those. Scattered misses inside an");
    console.log("    otherwise-priced set are upstream 500s — just re-run, priced cards are skipped.");
  }
  const covered = r.alreadyPriced + r.freshlyFetched;
  if (r.checklist > 0) {
    console.log(`checklist coverage: ${covered}/${r.checklist} (${((100 * covered) / r.checklist).toFixed(1)}%)`);
  }
  const left = r.candidates - r.processed;
  if (left > 0) console.log(`${left} card(s) left (--max) — re-run to continue.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
