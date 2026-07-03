import type { SupabaseClient } from "@supabase/supabase-js";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { CardRef, PriceProvider, PriceProviderError, PricingSource } from "./PriceProvider";
import { getPriceProviders } from "./index";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * True when a resolved price actually carries a usable value — at least one
 * finish with a `market` price, or any real per-condition price. A bedrock miss
 * (card present upstream but no `tcgplayer.prices`, e.g. a brand-new set) never
 * lands in the result map at all, but this also guards the belt-and-suspenders
 * case of an empty payload having been cached.
 */
function hasUsablePrice(r?: ResolvedPrice): boolean {
  if (!r) return false;
  const hasMarket = !!r.prices && Object.values(r.prices).some((v) => v?.market != null);
  const hasCondition = !!r.conditionPrices && Object.keys(r.conditionPrices).length > 0;
  return hasMarket || hasCondition;
}

/** A resolved price for one card (from cache or a fresh upstream fetch). */
export interface ResolvedPrice {
  cardApiId: string;
  game: string;
  prices: TcgPlayerData["prices"];
  conditionPrices: Record<string, Record<string, number>> | null;
  source: PricingSource;
  tcgplayerId: string | null;
  tcgplayerUrl: string | null;
  updatedAt: string;
  /** Complete untouched provider payload — persisted to card_prices.raw and the
   *  card_price_snapshots archive so no fetched field is ever discarded. */
  raw?: unknown;
  /** true = served from the cache (unchanged); false = freshly fetched this call.
   *  Callers use this to decide whether to fan the new value out to other holders. */
  fromCache: boolean;
}

interface EngineOptions {
  providers?: PriceProvider[];
  now?: () => number;
}

interface GetPricesOptions {
  /** Allow providers to spend extra quota resolving unmapped cards (on-demand path). */
  allowResolve?: boolean;
}

/**
 * Orchestrates the cascading, cache-first pricing flow:
 *   1. Read card_prices (shared cross-user cache); rows < 6h old are hits.
 *   2. Cascade stale/missing cards through configured providers in tier order.
 *      - Circuit breaker: a PriceProviderError (429/401/403) stops that provider
 *        and cascades its chunk to the next tier. Cards merely absent from a
 *        provider's result also cascade (one source's 404 ≠ a global 404).
 *      - Budget guard: each provider's daily request cap (price_api_usage) is
 *        respected; once reached the provider is skipped.
 *   3. Write fresh results back to card_prices (and persist mapped tcgplayer_id).
 *
 * Backend-only: constructed with a service-role (admin) Supabase client.
 */
export class PriceFetchEngine {
  private readonly providers: PriceProvider[];
  private readonly now: () => number;

  constructor(private readonly db: SupabaseClient, opts: EngineOptions = {}) {
    this.providers = opts.providers ?? getPriceProviders();
    this.now = opts.now ?? Date.now;
  }

  async getPrices(
    cards: CardRef[],
    opts: GetPricesOptions = {},
  ): Promise<Map<string, ResolvedPrice>> {
    const results = new Map<string, ResolvedPrice>();
    const byId = new Map<string, CardRef>();
    for (const c of cards) if (!byId.has(c.apiId)) byId.set(c.apiId, c);
    const ids = [...byId.keys()];
    if (ids.length === 0) return results;

    // 1. Cache read (6h freshness). Stale rows still surrender their tcgplayer_id.
    const stale: CardRef[] = [];
    const cached = await this.readCache(ids);
    for (const id of ids) {
      const ref = byId.get(id)!;
      const row = cached.get(id);
      if (row && this.now() - new Date(row.updatedAt).getTime() < SIX_HOURS_MS) {
        results.set(id, row);
        continue;
      }
      stale.push({ ...ref, tcgplayerId: ref.tcgplayerId ?? row?.tcgplayerId ?? null });
    }
    if (process.env.PRICE_DEBUG) console.log(`[PRICE] in=${ids.length} cacheHits=${ids.length - stale.length} stale=${stale.length}`);
    if (stale.length === 0) return results;

    // 2. Cascade through providers.
    const usageToday = await this.loadUsage();
    const usageMonth = await this.loadMonthUsage();
    const writes: ResolvedPrice[] = [];
    let remaining = stale;

    for (const provider of this.providers) {
      if (remaining.length === 0) break;

      const ctx = {
        allowResolve: opts.allowResolve ?? false,
        recordRequest: async () => {
          const dayCap = provider.dailyRequestCap;
          const monthCap = provider.monthlyRequestCap;
          const usedDay = usageToday.get(provider.source) ?? 0;
          const usedMonth = usageMonth.get(provider.source) ?? 0;
          if (dayCap !== null && usedDay >= dayCap) return false;
          if (monthCap !== null && usedMonth >= monthCap) return false;
          usageToday.set(provider.source, usedDay + 1);
          usageMonth.set(provider.source, usedMonth + 1);
          return true;
        },
      };

      const stillStale: CardRef[] = [];
      let providerDead = false;

      for (const chunk of this.chunk(remaining, provider.batchSize)) {
        if (providerDead) {
          stillStale.push(...chunk);
          continue;
        }
        try {
          const payloads = await provider.fetchBatch(chunk, ctx);
          for (const ref of chunk) {
            const payload = payloads.get(ref.apiId);
            if (!payload) {
              stillStale.push(ref); // not found here → cascade
              continue;
            }
            const resolved: ResolvedPrice = {
              cardApiId: ref.apiId,
              game: ref.game ?? "pokemon",
              prices: payload.prices,
              conditionPrices: payload.conditionPrices ?? null,
              source: provider.source,
              tcgplayerId: payload.tcgplayerId ?? ref.tcgplayerId ?? null,
              tcgplayerUrl: payload.tcgplayerUrl ?? null,
              updatedAt: new Date(this.now()).toISOString(),
              raw: payload.raw ?? null,
              fromCache: false,
            };
            results.set(ref.apiId, resolved);
            writes.push(resolved);
          }
        } catch (err) {
          if (err instanceof PriceProviderError) {
            // Rate-limited / quota / auth → stop using this provider, cascade rest.
            providerDead = true;
            stillStale.push(...chunk);
            // Back off for the rest of the UTC day. The upstream reported a hard
            // limit (e.g. JustTCG 401/429 over its free-tier cap), which can occur
            // before our own counter reaches the cap when requests are made
            // out-of-band. Pin usage to the cap so later refreshes this day skip
            // the provider entirely instead of re-hitting the wall; loadUsage
            // reads a fresh day at UTC midnight, so it self-resets.
            if (provider.dailyRequestCap != null) {
              usageToday.set(provider.source, provider.dailyRequestCap);
              if (process.env.PRICE_DEBUG) console.log(`[PRICE] ${provider.source} backed off for the day (HTTP ${err.status})`);
            }
          } else {
            stillStale.push(...chunk); // transient: let the next tier try
          }
        }
      }

      if (process.env.PRICE_DEBUG) {
        const got = remaining.length - stillStale.length;
        console.log(`[PRICE] provider=${provider.source} resolved=${got} dead=${providerDead} remaining->${stillStale.length}`);
      }
      remaining = stillStale;
    }

    if (process.env.PRICE_DEBUG) console.log(`[PRICE] writes=${writes.length} (sources: ${writes.map((w) => w.source).join(",") || "none"})`);
    await this.writeCache(writes);
    await this.persistUsage(usageToday);
    return results;
  }

  /**
   * Budget-conserving two-pass resolution for bulk/backfill/populate flows.
   *
   *   Pass 1 — `allowResolve: false`: cache + bedrock + any already-mapped JustTCG
   *            batch. Cards pokemontcg.io can price cost ZERO JustTCG requests.
   *   Pass 2 — only the cards still without a usable price go back through the
   *            cascade with `allowResolve: true`, letting JustTCG resolve the
   *            genuine gaps (e.g. brand-new sets pokemontcg.io hasn't priced yet).
   *            Still bounded by each provider's daily request cap.
   *
   * This is why a card can now pick up a value automatically on add/backfill
   * without blowing the limited JustTCG quota on cards bedrock already covers.
   * The single-card on-demand path (`/api/card-price`) still calls
   * `getPrices({ allowResolve: true })` directly — one card, resolve immediately.
   */
  async getPricesGapAware(cards: CardRef[]): Promise<Map<string, ResolvedPrice>> {
    const first = await this.getPrices(cards, { allowResolve: false });

    // Preserve caller ordering (market-refresh sorts by priority) so pass 2
    // spends the daily budget on the most important gaps first. Dedupe by apiId.
    const seen = new Set<string>();
    const gaps: CardRef[] = [];
    for (const c of cards) {
      if (seen.has(c.apiId)) continue;
      seen.add(c.apiId);
      if (!hasUsablePrice(first.get(c.apiId))) gaps.push(c);
    }
    if (process.env.PRICE_DEBUG) console.log(`[PRICE] gap-aware: pass1 priced=${cards.length - gaps.length} gaps=${gaps.length}`);
    if (gaps.length === 0) return first;

    const second = await this.getPrices(gaps, { allowResolve: true });
    for (const [id, r] of second) first.set(id, r);
    return first;
  }

  private async readCache(ids: string[]): Promise<Map<string, ResolvedPrice>> {
    const map = new Map<string, ResolvedPrice>();
    const { data } = await this.db
      .from("card_prices")
      .select("card_api_id, game, prices, condition_prices, source, tcgplayer_id, tcgplayer_url, updated_at, raw")
      .in("card_api_id", ids);
    for (const row of data ?? []) {
      map.set(row.card_api_id, {
        cardApiId: row.card_api_id,
        game: row.game,
        prices: row.prices,
        conditionPrices: row.condition_prices ?? null,
        source: row.source,
        tcgplayerId: row.tcgplayer_id ?? null,
        tcgplayerUrl: row.tcgplayer_url ?? null,
        updatedAt: row.updated_at,
        raw: row.raw ?? null,
        fromCache: true,
      });
    }
    return map;
  }

  private async writeCache(rows: ResolvedPrice[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.from("card_prices").upsert(
      rows.map((r) => ({
        card_api_id: r.cardApiId,
        game: r.game,
        prices: r.prices,
        condition_prices: r.conditionPrices,
        source: r.source,
        tcgplayer_id: r.tcgplayerId,
        tcgplayer_url: r.tcgplayerUrl,
        updated_at: r.updatedAt,
        raw: r.raw ?? null,
      })),
      { onConflict: "card_api_id,game" },
    );

    // Zero-loss archive: append the full provider payload of every fresh fetch,
    // never overwritten. Only rows that actually carried a payload are archived.
    const snapshots = rows
      .filter((r) => r.raw != null)
      .map((r) => ({
        card_api_id: r.cardApiId,
        game: r.game,
        source: r.source,
        raw: r.raw,
        fetched_at: r.updatedAt,
      }));
    if (snapshots.length > 0) {
      const { error } = await this.db.from("card_price_snapshots").insert(snapshots);
      // Archive failure must not break pricing — the value is still cached above.
      if (error) console.warn(`[pricing] card_price_snapshots insert failed: ${error.message}`);
    }
  }

  private async loadUsage(): Promise<Map<PricingSource, number>> {
    const map = new Map<PricingSource, number>();
    const today = this.utcDay();
    const { data } = await this.db
      .from("price_api_usage")
      .select("provider, request_count")
      .eq("day", today);
    for (const row of data ?? []) map.set(row.provider as PricingSource, row.request_count);
    return map;
  }

  /** Month-to-date request totals per provider, summed over the daily rows — no
   *  separate table needed. Enforces the monthly plan cap alongside the daily one. */
  private async loadMonthUsage(): Promise<Map<PricingSource, number>> {
    const map = new Map<PricingSource, number>();
    const monthStart = `${this.utcDay().slice(0, 7)}-01`; // YYYY-MM-01 (UTC)
    const { data } = await this.db
      .from("price_api_usage")
      .select("provider, request_count")
      .gte("day", monthStart);
    for (const row of data ?? []) {
      const src = row.provider as PricingSource;
      map.set(src, (map.get(src) ?? 0) + row.request_count);
    }
    return map;
  }

  private async persistUsage(usage: Map<PricingSource, number>): Promise<void> {
    const today = this.utcDay();
    const rows = [...usage.entries()].map(([provider, request_count]) => ({
      provider,
      day: today,
      request_count,
    }));
    if (rows.length === 0) return;
    await this.db.from("price_api_usage").upsert(rows, { onConflict: "provider,day" });
  }

  private utcDay(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
}
