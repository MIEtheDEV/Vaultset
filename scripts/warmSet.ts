/**
 * Set price-warming job — standalone, budget-bounded, resumable.
 *
 * Warms the shared `card_prices` cache for one set, sourced from the `set_cards`
 * checklist (NOT the `cards` table). Companion to `warm:catalog`, which can only
 * reach cards someone already owns/added: a brand-new set (e.g. Mega Evolution
 * "Pitch Black" / me5) that pokemontcg.io's live API hasn't catalogued and nobody
 * owns exists ONLY in `set_cards`, so its card-data pages render (via the set_cards
 * fallback) but show no value until something warms them. This is that something.
 *
 * The same warming is folded into `pnpm sets:index` (gap-only) so new releases
 * self-warm; run this directly to force or refresh a specific set.
 *
 * Usage:
 *   pnpm warm:set --set me5             # warm Pitch Black, up to today's budget
 *   pnpm warm:set --set me5 --dry-run   # list what would be warmed, no API calls
 *   pnpm warm:set --set me5 --max=40    # cap this run at 40 cards
 *   pnpm warm:set --set me5 --missing   # only fill cards with no cached price yet
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Pricing modules are imported DYNAMICALLY inside main(), AFTER dotenv loads —
// JustTcgPriceProvider reads its plan limits from env in its constructor, and a
// static import would evaluate it before JUSTTCG_API_KEY_PAID is set (silently
// capping the paid key at free-tier limits). See scripts/warmCatalog.ts.

const setArg = process.argv.find((a) => a.startsWith("--set="))?.split("=")[1]
  ?? (process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : undefined);
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_MISSING = process.argv.includes("--missing");
const maxArg = process.argv.find((a) => a.startsWith("--max="))?.split("=")[1];

async function main() {
  if (!setArg) {
    console.error("Usage: pnpm warm:set --set <setCode> [--dry-run] [--missing] [--max=N]");
    process.exit(1);
  }

  const { createAdminClient } = await import("@/utils/supabase/admin");
  const { warmSetPrices }     = await import("@/lib/pricing/warmSetPrices");

  const r = await warmSetPrices(createAdminClient(), [setArg], {
    max: maxArg ? Number(maxArg) : undefined,
    onlyMissing: ONLY_MISSING,
    dryRun: DRY_RUN,
    log: console.log,
  });
  if (!DRY_RUN) {
    if (r.aborted) {
      console.log(`aborted: ${setArg} didn't resolve upstream — ${r.dropped} card(s) left unwarmed (no budget wasted).`);
    } else if (r.processed > 0) {
      console.log(`done: attempted ${r.processed}, freshlyPriced=${r.freshlyFetched}, collection_items updated=${r.itemsUpdated}` +
        (r.dropped ? `, deferred=${r.dropped} (budget — re-run later)` : ""));
    } else {
      console.log("Nothing to do (budget spent or set fully warm).");
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
