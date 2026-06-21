import type { SupabaseClient } from "@supabase/supabase-js";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { CardRef, PriceProvider, PriceProviderError, PricingSource } from "./PriceProvider";
import { getPriceProviders } from "./index";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

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
    if (stale.length === 0) return results;

    // 2. Cascade through providers.
    const usageToday = await this.loadUsage();
    const writes: ResolvedPrice[] = [];
    let remaining = stale;

    for (const provider of this.providers) {
      if (remaining.length === 0) break;

      const ctx = {
        allowResolve: opts.allowResolve ?? false,
        recordRequest: async () => {
          const cap = provider.dailyRequestCap;
          const used = usageToday.get(provider.source) ?? 0;
          if (cap !== null && used >= cap) return false;
          usageToday.set(provider.source, used + 1);
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
          } else {
            stillStale.push(...chunk); // transient: let the next tier try
          }
        }
      }

      remaining = stillStale;
    }

    await this.writeCache(writes);
    await this.persistUsage(usageToday);
    return results;
  }

  private async readCache(ids: string[]): Promise<Map<string, ResolvedPrice>> {
    const map = new Map<string, ResolvedPrice>();
    const { data } = await this.db
      .from("card_prices")
      .select("card_api_id, game, prices, condition_prices, source, tcgplayer_id, tcgplayer_url, updated_at")
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
      })),
      { onConflict: "card_api_id,game" },
    );
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
