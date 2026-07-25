/**
 * Scheduled price refresh for recently-released sets.
 *
 * Why this exists: a set's prices are thinnest and move fastest in the weeks
 * after release, and nothing in the repo re-ran on a schedule — every warm was a
 * manual `pnpm` invocation. Measured on 2026-07-25, Pitch Black (8 days old) had
 * 58% of its condition ladders incoherent (played grades priced ABOVE near mint),
 * which is the signature of a two-or-three-listing sample rather than a market.
 * That's what put our #1 chase card at odds with every external source. It fixes
 * itself as listings accumulate — but only if something re-reads it.
 *
 * Two passes, cheapest first:
 *   1. Bedrock (pokemontcg.io) — uncapped and free, refreshes everything it can
 *      price. ~38 requests for six months of sets.
 *   2. JustTCG — only for the sets bedrock returned nothing for, which in practice
 *      means the newest releases pokemontcg.io hasn't catalogued yet. Bounded by
 *      the JustTCG daily budget, newest set first.
 *
 * Usage:
 *   pnpm refresh:recent                 # last 6 months of sets
 *   pnpm refresh:recent --months=3
 *   pnpm refresh:recent --dry-run       # show the plan, no calls, no writes
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { SupabaseClient } from "@supabase/supabase-js";

// Pricing modules are imported DYNAMICALLY inside main(), AFTER dotenv loads —
// JustTcgPriceProvider reads its plan limits from env in its constructor, so a
// static import would lock it to free-tier limits. See scripts/warmCatalog.ts.

const arg = (name: string): string | undefined => {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=");
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const DRY_RUN = process.argv.includes("--dry-run");
const MONTHS = Number(arg("months") ?? 6);

/** Cards used to re-test whether a bedrock-blind set has been priced upstream yet. */
const PROBE_SIZE = 10;

interface SetCoverage {
  cards: number;
  priced: number;
  unpriced: number;
  /** Rows sourced from pokemontcg.io — proof bedrock can price this set at all. */
  bedrock: number;
}

/** Per-set price coverage, split by source. Two bounded reads per set. */
async function coverageBySet(
  db: SupabaseClient,
  setCodes: string[],
): Promise<Map<string, SetCoverage>> {
  const out = new Map<string, SetCoverage>();
  for (const code of setCodes) {
    const { data: rows } = await db
      .from("set_cards")
      .select("pokemon_api_id")
      .eq("set_code", code)
      .not("pokemon_api_id", "is", null);
    const ids = (rows ?? []).map((r) => r.pokemon_api_id as string);
    if (ids.length === 0) { out.set(code, { cards: 0, priced: 0, unpriced: 0, bedrock: 0 }); continue; }

    let priced = 0, bedrock = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await db
        .from("card_prices")
        .select("card_api_id, source")
        .in("card_api_id", ids.slice(i, i + 500));
      for (const p of (data ?? []) as { card_api_id: string; source: string }[]) {
        priced++;
        if (p.source === "pokemon_tcg") bedrock++;
      }
    }
    out.set(code, { cards: ids.length, priced, unpriced: ids.length - priced, bedrock });
  }
  return out;
}

async function main() {
  const { createAdminClient }  = await import("@/utils/supabase/admin");
  const { sweepBedrockPrices } = await import("@/lib/pricing/sweepBedrockPrices");
  const { warmSetPrices }      = await import("@/lib/pricing/warmSetPrices");

  const admin = createAdminClient();

  // Recent sets, newest first — from the release_date we now denormalize onto
  // set_cards (exposed as one small JSONB object by the set_release_dates RPC).
  const { data: releaseDates } = await admin.rpc("set_release_dates");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MONTHS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const recent = Object.entries((releaseDates ?? {}) as Record<string, string>)
    .filter(([, d]) => d >= cutoffIso)
    .sort((a, b) => b[1].localeCompare(a[1]));

  if (recent.length === 0) {
    console.log(`no sets released since ${cutoffIso} — nothing to refresh`);
    return;
  }
  const setCodes = recent.map(([code]) => code);
  const cov = await coverageBySet(admin, setCodes);
  console.log(`refreshing ${setCodes.length} set(s) released since ${cutoffIso}:`);
  for (const [code, d] of recent) {
    const c = cov.get(code)!;
    console.log(`  ${code.padEnd(12)} ${d}  ${c.priced}/${c.cards} priced (${c.bedrock} via bedrock)`);
  }

  // ── Pass 1: bedrock, free and uncapped ────────────────────────────────────
  // Skip sets bedrock has demonstrably never priced: if a set has cached prices
  // but not one from pokemontcg.io, it's a release upstream hasn't catalogued,
  // and re-attempting it every week burns a full round of retries and backoff to
  // return nothing. A set with no prices at all is still unproven, so we try it.
  const bedrockSets = setCodes.filter((c) => {
    const s = cov.get(c)!;
    return s.bedrock > 0 || s.priced === 0;
  });
  const skipped = setCodes.filter((c) => !bedrockSets.includes(c));

  console.log("\n[1/2] bedrock refresh");

  // A skipped set must be able to come back: pokemontcg.io catches up on new
  // releases eventually, and without a re-test a JustTCG-first set would be
  // locked out of bedrock permanently. Probe each with a handful of cards —
  // ~1 request apiece — and promote any that now return prices.
  const graduated: string[] = [];
  for (const code of skipped) {
    const probe = await sweepBedrockPrices(admin, {
      setCodes: [code], refresh: true, max: PROBE_SIZE, dryRun: DRY_RUN, log: () => {},
    });
    if (probe.freshlyFetched > 0) graduated.push(code);
  }
  const stillSkipped = skipped.filter((c) => !graduated.includes(c));
  if (graduated.length) console.log(`  ${graduated.join(", ")} now priced upstream — including`);
  if (stillSkipped.length) {
    console.log(`  skipping ${stillSkipped.join(", ")} — no bedrock coverage upstream yet` +
      (DRY_RUN ? " (probe is a no-op in --dry-run)" : ""));
  }
  bedrockSets.push(...graduated);
  bedrockSets.sort((a, b) => setCodes.indexOf(a) - setCodes.indexOf(b)); // newest first

  const sweep = bedrockSets.length
    ? await sweepBedrockPrices(admin, {
        setCodes: bedrockSets,
        refresh: true,
        dryRun: DRY_RUN,
        log: (m) => console.log(`  ${m}`),
      })
    : null;

  if (!sweep) {
    console.log("  nothing for bedrock this run");
  } else {
    console.log(
      `  bedrock: processed ${sweep.processed}, repriced ${sweep.freshlyFetched}, ` +
      `no price ${sweep.unresolved}, requests ${sweep.requests}${sweep.retries ? ` (${sweep.retries} retried)` : ""}`,
    );
  }

  // ── Pass 2: JustTCG, only where gaps remain ───────────────────────────────
  // Read the remaining gaps from the DB rather than from the sweep's own
  // accounting: that stays correct in --dry-run (where the sweep writes nothing
  // and reports no misses) and it also catches cards bedrock never attempted.
  // A set still missing prices here is one pokemontcg.io hasn't caught up on —
  // exactly the new releases this job exists for, and the only place the limited
  // JustTCG budget is worth spending.
  const gaps = DRY_RUN ? cov : await coverageBySet(admin, setCodes);
  const needsJustTcg = setCodes.filter((code) => (gaps.get(code)?.unpriced ?? 0) > 0); // newest first

  if (!process.env.JUSTTCG_API_KEY) {
    console.log("\n[2/2] JustTCG skipped — JUSTTCG_API_KEY not set");
  } else if (needsJustTcg.length === 0) {
    console.log("\n[2/2] JustTCG not needed — bedrock priced every recent set");
  } else {
    const detail = needsJustTcg.map((c) => `${c}:${gaps.get(c)!.unpriced}`).join(", ");
    console.log(`\n[2/2] JustTCG top-up — ${needsJustTcg.length} set(s) with gaps (${detail})`);
    const warm = await warmSetPrices(admin, needsJustTcg, {
      onlyMissing: true,
      dryRun: DRY_RUN,
      log: (m) => console.log(`  ${m}`),
    });
    console.log(
      `  justtcg: processed ${warm.processed}, freshly priced ${warm.freshlyFetched}, ` +
      `collection_items updated ${warm.itemsUpdated}` +
      (warm.dropped ? `, deferred ${warm.dropped} (budget — next run picks these up)` : ""),
    );
  }

  if (DRY_RUN) console.log("\n[DRY RUN] no API calls made, nothing written.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
