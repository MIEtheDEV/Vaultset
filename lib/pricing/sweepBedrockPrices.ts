import type { SupabaseClient } from "@supabase/supabase-js";
import { PriceFetchEngine } from "./PriceFetchEngine";
import { PokemonTcgPriceProvider } from "./PokemonTcgPriceProvider";
import { propagateMarketValues } from "./propagateMarketValues";
import type { CardRef } from "./PriceProvider";

// Whole-checklist price sweep using ONLY the bedrock tier (pokemontcg.io).
//
// Why this exists, separate from warm:catalog / warm:set:
//   * `warmCatalog` walks the `cards` table (~1.7k rows) — it structurally cannot
//     reach the ~18.7k-card `set_cards` checklist the public hubs render.
//   * `warmSetPrices` does read the checklist, but derives its per-run card cap
//     from the *remaining JustTCG daily request budget*. That conflates two
//     different units (JustTCG requests vs cards) and throttles bedrock — which
//     spends no JustTCG quota at all — behind a Tier-1 limit.
//
// Bedrock declares `dailyRequestCap = null` and batches 50 ids per request, so
// the entire checklist is ~374 requests with no cap and no key required. A
// measured probe of 50 random unpriced checklist cards returned tcgplayer prices
// for 49 — the data was always there, nothing was fetching it.
//
// Deliberately NOT `getPricesGapAware`: that exists to let JustTCG resolve the
// residue, which is exactly the budget we're trying not to spend here. This runs
// bedrock and stops. JustTCG quota stays free for what it's actually better at —
// real-time and per-condition prices on owned / high-value cards.

/** Cards per engine call. Bounds the cache-read `.in(...)` filter; the engine
 *  then chunks these into 50-id upstream requests internally. */
const SLICE = 500;

/** Pause between slices, so a full sweep doesn't machine-gun pokemontcg.io. */
const DEFAULT_DELAY_MS = 250;

/**
 * pokemontcg.io throws intermittent 500s. Measured: the same 10 ids 500'd while
 * the 50-id batch containing them returned 200 — so it tracks neither batch size
 * nor specific cards, it's just flaky. The engine doesn't retry, and `ensureOk`
 * turns a non-OK response into an empty result, so one blip silently costs a
 * whole 50-card batch for the run.
 *
 * We can't see the status code from out here, so we retry on a *completely* empty
 * batch. That does mean a genuinely price-less set (me3/me4/me5 — pokemontcg.io
 * carries the cards with a tcgplayer url but no `prices` block until it catches
 * up on a release) burns its retries for nothing. That's the right trade: bedrock
 * is uncapped, so the wasted requests cost nothing, whereas silently dropping 50
 * real cards costs coverage. A partial batch is never retried.
 *
 * Retries are deliberately not exhaustive — the sweep skips already-priced cards,
 * so anything lost to a bad window is picked up free on the next run.
 */
class RetryingBedrockProvider extends PokemonTcgPriceProvider {
  /** Actual upstream HTTP calls made, retries included. */
  calls = 0;
  retries = 0;
  constructor(private readonly attempts = 4, private readonly backoffMs = 1000) {
    super();
  }
  async fetchBatch(...[cards, ctx]: Parameters<PokemonTcgPriceProvider["fetchBatch"]>) {
    this.calls++;
    let out = await super.fetchBatch(cards, ctx);
    for (let i = 1; i < this.attempts && out.size === 0; i++) {
      // Exponential backoff with jitter, so a bad window isn't hammered in lockstep.
      await sleep(this.backoffMs * 2 ** (i - 1) + Math.floor(Math.random() * 250));
      this.calls++;
      this.retries++;
      out = await super.fetchBatch(cards, ctx);
    }
    return out;
  }
}

export interface BedrockSweepOptions {
  /** Cap cards considered this run. Default: no cap (bedrock is uncapped). */
  max?: number;
  /** Restrict to these set codes. Default: the whole checklist. */
  setCodes?: string[];
  /** Also re-price cards that already have a cached row. The engine still serves
   *  anything under 6h old from cache, so this refreshes without re-fetching. */
  refresh?: boolean;
  /** Milliseconds to wait between slices. */
  delayMs?: number;
  dryRun?: boolean;
  log?: (msg: string) => void;
}

export interface BedrockSweepResult {
  checklist: number;       // checklist cards with a native pokemontcg.io id
  alreadyPriced: number;   // of those, ones with a cached price row
  candidates: number;      // eligible after the refresh/onlyMissing filter
  processed: number;       // cards actually sent through the engine
  freshlyFetched: number;  // cards that got a fresh price written this run
  unresolved: number;      // processed but bedrock had no tcgplayer.prices
  itemsUpdated: number;    // collection_items rows repriced by propagation
  requests: number;        // bedrock HTTP requests spent
  retries: number;         // batches re-fetched after coming back empty
  /** Sets where bedrock priced nothing, worst first — normally sets too new for
   *  pokemontcg.io to have caught up on. These are JustTCG's job, not this job's. */
  unresolvedBySet: { setCode: string; count: number }[];
  dryRun: boolean;
}

type ChecklistRow = {
  pokemon_api_id: string | null;
  name: string | null;
  set_name: string | null;
  set_code: string | null;
  card_number: string | null;
};

/** Page through a query past PostgREST's ~1000-row response cap. Requires a
 *  stable total ordering on the query so pages neither overlap nor skip. */
async function paginate<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/** Which of `apiIds` already have a cached price row. */
async function loadPriced(admin: SupabaseClient, apiIds: string[]): Promise<Set<string>> {
  const priced = new Set<string>();
  for (let i = 0; i < apiIds.length; i += SLICE) {
    const { data } = await admin
      .from("card_prices")
      .select("card_api_id")
      .in("card_api_id", apiIds.slice(i, i + SLICE));
    for (const row of (data ?? []) as { card_api_id: string }[]) priced.add(row.card_api_id);
  }
  return priced;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sweepBedrockPrices(
  admin: SupabaseClient,
  opts: BedrockSweepOptions = {},
): Promise<BedrockSweepResult> {
  const log = opts.log ?? (() => {});
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  // Newest sets first, so a --max-limited or interrupted run has covered the
  // most-searched cards. (set_code, card_number) is uniquely constrained, which
  // makes this ordering total — required for correct pagination.
  const rows = await paginate<ChecklistRow>((from, to) => {
    let q = admin
      .from("set_cards")
      .select("pokemon_api_id, name, set_name, set_code, card_number")
      .not("pokemon_api_id", "is", null);
    if (opts.setCodes?.length) q = q.in("set_code", opts.setCodes);
    return q
      .order("release_date", { ascending: false, nullsFirst: false })
      .order("set_code")
      .order("card_number")
      .range(from, to);
  });

  const checklist = rows.filter((r) => r.pokemon_api_id);
  const empty: BedrockSweepResult = {
    checklist: checklist.length, alreadyPriced: 0, candidates: 0, processed: 0,
    freshlyFetched: 0, unresolved: 0, itemsUpdated: 0, requests: 0, retries: 0,
    unresolvedBySet: [], dryRun: !!opts.dryRun,
  };
  if (checklist.length === 0) {
    log("no checklist cards matched — nothing to sweep");
    return empty;
  }

  const priced = await loadPriced(admin, checklist.map((r) => r.pokemon_api_id as string));
  const eligible = opts.refresh ? checklist : checklist.filter((r) => !priced.has(r.pokemon_api_id as string));
  const slice = opts.max != null ? eligible.slice(0, Math.max(0, Math.floor(opts.max))) : eligible;

  const refs: CardRef[] = slice.map((r) => ({
    apiId: r.pokemon_api_id as string,
    tcgplayerId: null,
    name: r.name ?? undefined,
    setName: r.set_name ?? undefined,
    setCode: r.set_code ?? undefined,
    number: r.card_number ?? undefined,
  }));

  const estRequests = Math.ceil(refs.length / 50);
  log(`checklist=${checklist.length} alreadyPriced=${priced.size} eligible=${eligible.length} → processing ${refs.length}`);
  log(`bedrock is uncapped; this run costs ~${estRequests} pokemontcg.io request(s), 0 JustTCG`);

  const base: BedrockSweepResult = {
    ...empty, alreadyPriced: priced.size, candidates: eligible.length,
  };
  if (opts.dryRun || refs.length === 0) return base;

  // Bedrock ONLY. Passing an explicit provider list keeps JustTCG out of the
  // cascade entirely, so no amount of upstream misses can spend its quota.
  const provider = new RetryingBedrockProvider();
  const engine = new PriceFetchEngine(admin, { providers: [provider] });

  let processed = 0, freshlyFetched = 0, itemsUpdated = 0;
  const missBySet = new Map<string, number>();

  for (let i = 0; i < refs.length; i += SLICE) {
    const chunk = refs.slice(i, i + SLICE);
    const resolved = await engine.getPrices(chunk, { allowResolve: false });
    const fresh = [...resolved.values()].filter((p) => !p.fromCache).map((p) => p.cardApiId);

    for (const ref of chunk) {
      if (resolved.has(ref.apiId)) continue;
      const code = ref.setCode ?? "(unknown)";
      missBySet.set(code, (missBySet.get(code) ?? 0) + 1);
    }

    processed += chunk.length;
    freshlyFetched += fresh.length;
    if (fresh.length) itemsUpdated += await propagateMarketValues(admin, fresh);

    // Name the sets in the slice: a 0-priced slice is almost always a set too new
    // for pokemontcg.io, and saying so beats looking like a broken run.
    const sets = [...new Set(chunk.map((c) => c.setCode ?? "?"))];
    const label = sets.length <= 3 ? sets.join(",") : `${sets[0]}…${sets[sets.length - 1]} (${sets.length} sets)`;
    log(`  ${Math.min(i + SLICE, refs.length)}/${refs.length} [${label}] — +${fresh.length} priced (${freshlyFetched} total)`);
    if (i + SLICE < refs.length && delayMs > 0) await sleep(delayMs);
  }

  return {
    ...base,
    processed,
    freshlyFetched,
    // Bedrock had no usable price for these — either a set it hasn't caught up on
    // yet, or a one-off like mcd18-11 (a McDonald's promo it carries with no
    // tcgplayer block). Retried on every sweep; a standing cost, not a failure.
    unresolved: processed - freshlyFetched,
    itemsUpdated,
    requests: provider.calls,
    retries: provider.retries,
    unresolvedBySet: [...missBySet.entries()]
      .map(([setCode, count]) => ({ setCode, count }))
      .sort((a, b) => b.count - a.count),
  };
}
