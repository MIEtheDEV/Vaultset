import type { SupabaseClient } from "@supabase/supabase-js";
import { PriceFetchEngine, hasUsablePrice } from "./PriceFetchEngine";
import { propagateMarketValues } from "./propagateMarketValues";
import { justTcgLimits } from "./justtcgTier";
import type { CardRef } from "./PriceProvider";

// Sample size for the pre-warm probe (see below). Small enough that a set which
// can't be matched wastes only a handful of requests, not the whole daily budget.
const PROBE_SIZE = 8;

// Warm the shared `card_prices` cache for whole sets, sourced from the `set_cards`
// checklist (NOT the `cards` table). This is what lets a brand-new set — which
// lives only in `set_cards` because pokemontcg.io's live API lags releases and
// nobody owns it yet — pick up market values instead of rendering blank. Used by
// the standalone `pnpm warm:set` and folded into `pnpm sets:index` so new releases
// self-warm right after the checklist is (re)built.
//
// Reuses the real engine (bedrock-free first, then JustTCG for the gaps) and is
// bounded by the remaining JustTCG daily budget, so it's safe to run repeatedly.
// The first-time resolve costs ~1 JustTCG request per card, so a large set warms
// over several runs; already-priced cards are served from cache, not re-fetched.

export interface WarmSetOptions {
  /** Cap cards processed this run. Default: the remaining JustTCG daily budget. */
  max?: number;
  /** Only warm cards with no cached price yet (skip refreshing already-priced ones). */
  onlyMissing?: boolean;
  dryRun?: boolean;
  log?: (msg: string) => void;
}

export interface WarmSetResult {
  cards: number;          // checklist cards with a native id across the sets
  alreadyPriced: number;
  candidates: number;     // cards eligible to warm (after the onlyMissing filter)
  processed: number;      // cards actually sent to the engine this run
  freshlyFetched: number; // cards that got a fresh price written this run
  itemsUpdated: number;
  dropped: number;        // eligible but skipped (budget/max ran out, or probe abort)
  aborted: boolean;       // true = probe found nothing priceable, set skipped
  dryRun: boolean;
}

type SetCardRow = {
  pokemon_api_id: string | null;
  name: string | null;
  set_name: string | null;
  set_code: string | null;
  card_number: string | null;
};

/** Load which of `apiIds` already have a cached price row (+ any tcgplayer_id). */
async function loadPriced(
  admin: SupabaseClient,
  apiIds: string[],
): Promise<Map<string, string | null>> {
  const priced = new Map<string, string | null>();
  for (let i = 0; i < apiIds.length; i += 500) {
    const { data } = await admin
      .from("card_prices")
      .select("card_api_id, tcgplayer_id")
      .in("card_api_id", apiIds.slice(i, i + 500));
    for (const p of (data ?? []) as { card_api_id: string; tcgplayer_id: string | null }[]) {
      priced.set(p.card_api_id, p.tcgplayer_id);
    }
  }
  return priced;
}

export async function warmSetPrices(
  admin: SupabaseClient,
  setCodes: string[],
  opts: WarmSetOptions = {},
): Promise<WarmSetResult> {
  const log = opts.log ?? (() => {});
  const empty: WarmSetResult = {
    cards: 0, alreadyPriced: 0, candidates: 0, processed: 0,
    freshlyFetched: 0, itemsUpdated: 0, dropped: 0, aborted: false, dryRun: !!opts.dryRun,
  };
  if (setCodes.length === 0) return empty;

  // The sets' checklists, in the given set order (newest-first from the caller),
  // so a budget-limited run warms the most-wanted sets first.
  const orderedCards: SetCardRow[] = [];
  for (let i = 0; i < setCodes.length; i += 100) {
    const chunk = setCodes.slice(i, i + 100);
    const { data } = await admin
      .from("set_cards")
      .select("pokemon_api_id, name, set_name, set_code, card_number")
      .in("set_code", chunk)
      .order("card_number");
    orderedCards.push(...((data ?? []) as SetCardRow[]));
  }
  // Preserve caller's set ordering (the `.in` above doesn't guarantee it).
  const rank = new Map(setCodes.map((c, i) => [c, i]));
  const cards = orderedCards
    .filter((r) => r.pokemon_api_id)
    .sort((a, b) => (rank.get(a.set_code ?? "") ?? 0) - (rank.get(b.set_code ?? "") ?? 0));
  if (cards.length === 0) return empty;

  const apiIds = cards.map((r) => r.pokemon_api_id as string);
  const priced = await loadPriced(admin, apiIds);

  // Budget: remaining JustTCG daily requests → default cap for this run.
  const limits = justTcgLimits();
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from("price_api_usage").select("request_count").eq("provider", "justtcg").eq("day", today).maybeSingle();
  const usedToday = usage?.request_count ?? 0;
  const remaining = limits.dailyCap == null ? Infinity : Math.max(0, limits.dailyCap - usedToday);
  const max = opts.max ?? (remaining === Infinity ? 5000 : remaining);

  // Eligible cards. onlyMissing → gaps only; otherwise unpriced first, priced last.
  const eligible = cards.filter((r) => !opts.onlyMissing || !priced.has(r.pokemon_api_id as string));
  const refs: CardRef[] = eligible
    .map((r) => ({
      apiId: r.pokemon_api_id as string,
      tcgplayerId: priced.get(r.pokemon_api_id as string) ?? null,
      name: r.name ?? undefined,
      setName: r.set_name ?? undefined,
      setCode: r.set_code ?? undefined,
      number: r.card_number ?? undefined,
    }))
    .sort((a, b) => Number(priced.has(a.apiId)) - Number(priced.has(b.apiId)));

  const slice = refs.slice(0, Math.max(0, Math.floor(max)));
  const dropped = refs.length - slice.length;

  log(`sets=${setCodes.length} cards=${cards.length} alreadyPriced=${priced.size} eligible=${refs.length} budget=${remaining}`);
  log(`${opts.dryRun ? "[DRY RUN] would process" : "processing"} ${slice.length} card(s)${dropped ? ` (${dropped} deferred — budget/max)` : ""}`);

  const base: WarmSetResult = {
    cards: cards.length, alreadyPriced: priced.size, candidates: refs.length,
    processed: 0, freshlyFetched: 0, itemsUpdated: 0, dropped, aborted: false, dryRun: !!opts.dryRun,
  };
  if (opts.dryRun || slice.length === 0) return base;

  const engine = new PriceFetchEngine(admin);

  // Probe guard: before committing the whole batch, warm a small sample spread
  // across it. If NONE of the sample resolves to a usable price, this set isn't
  // confidently matchable upstream (e.g. its checklist numbering doesn't line up
  // with JustTCG's grouping — a combined "megaset"), and grinding every card
  // would burn ~1–2 requests each for nothing, potentially draining the whole
  // daily budget. Abort after the probe instead. A matchable set loses nothing:
  // the probe's cards are cached, so the full run below re-reads them for free.
  if (slice.length > PROBE_SIZE * 2) {
    const step = Math.max(1, Math.floor(slice.length / PROBE_SIZE));
    const probe: CardRef[] = [];
    for (let i = 0; i < slice.length && probe.length < PROBE_SIZE; i += step) probe.push(slice[i]);
    const probeRes = await engine.getPricesGapAware(probe);
    const usable = [...probeRes.values()].filter(hasUsablePrice).length;
    log(`probe: ${usable}/${probe.length} of a spread sample priced`);
    if (usable === 0) {
      log(`aborting — sample didn't resolve upstream (set likely a mismatched grouping); ${slice.length - probe.length} card(s) skipped to save budget`);
      return { ...base, processed: probe.length, freshlyFetched: 0, dropped: refs.length - probe.length, aborted: true };
    }
  }

  const resolved = await engine.getPricesGapAware(slice);
  const fresh = [...resolved.values()].filter((p) => !p.fromCache).map((p) => p.cardApiId);
  const itemsUpdated = await propagateMarketValues(admin, fresh);

  return { ...base, processed: slice.length, freshlyFetched: fresh.length, itemsUpdated };
}
