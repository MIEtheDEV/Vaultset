import { PriceFetchEngine } from "@/lib/pricing/PriceFetchEngine";
import {
  CardRef, FetchContext, PricePayload, PriceProvider, PriceProviderError, PricingSource,
} from "@/lib/pricing/PriceProvider";

const NOW = Date.parse("2026-06-20T12:00:00Z");
const price = (market: number): PricePayload => ({
  prices: { normal: { low: null, mid: null, high: null, market, directLow: null } },
});

// Minimal stand-in for the service-role Supabase client used by the engine.
function mockDb(cacheRows: any[] = [], usageRows: any[] = []) {
  const writes = { cardPrices: [] as any[], usage: [] as any[], snapshots: [] as any[] };
  const db = {
    writes,
    from(table: string) {
      if (table === "card_prices") {
        return {
          select: () => ({ in: async () => ({ data: cacheRows }) }),
          upsert: async (rows: any[]) => { writes.cardPrices.push(...rows); return { error: null }; },
        };
      }
      if (table === "card_price_snapshots") {
        return {
          insert: async (rows: any[]) => { writes.snapshots.push(...rows); return { error: null }; },
        };
      }
      return {
        select: () => ({
          eq:  async () => ({ data: usageRows }), // daily (loadUsage)
          gte: async () => ({ data: usageRows }), // month-to-date (loadMonthUsage)
        }),
        upsert: async (rows: any[]) => { writes.usage.push(...rows); return { error: null }; },
      };
    },
  };
  return db;
}

interface FakeOpts {
  source: PricingSource;
  batchSize?: number;
  cap?: number | null;
  monthlyCap?: number | null;
  behavior: (cards: CardRef[]) => Map<string, PricePayload>;
}
class FakeProvider extends PriceProvider {
  readonly source: PricingSource;
  readonly batchSize: number;
  readonly dailyRequestCap: number | null;
  readonly monthlyRequestCap: number | null;
  readonly calls: CardRef[][] = [];
  private behavior: FakeOpts["behavior"];
  constructor(o: FakeOpts) {
    super();
    this.source = o.source;
    this.batchSize = o.batchSize ?? 50;
    this.dailyRequestCap = o.cap ?? null;
    this.monthlyRequestCap = o.monthlyCap ?? null;
    this.behavior = o.behavior;
  }
  isConfigured() { return true; }
  async fetchBatch(cards: CardRef[], ctx: FetchContext): Promise<Map<string, PricePayload>> {
    this.calls.push(cards);
    if (!(await ctx.recordRequest())) throw new PriceProviderError(429, "budget");
    return this.behavior(cards);
  }
}

const refs = (...ids: string[]): CardRef[] => ids.map((apiId) => ({ apiId }));

describe("PriceFetchEngine", () => {
  it("returns fresh cached prices without calling any provider", async () => {
    const cache = [{
      card_api_id: "sv4-1", game: "pokemon",
      prices: price(10).prices, source: "justtcg",
      tcgplayer_id: "111", tcgplayer_url: null,
      updated_at: new Date(NOW - 60 * 60 * 1000).toISOString(), // 1h old → fresh
    }];
    const provider = new FakeProvider({ source: "pokemon_tcg", behavior: () => new Map() });
    const engine = new PriceFetchEngine(mockDb(cache) as any, { providers: [provider], now: () => NOW });

    const out = await engine.getPrices(refs("sv4-1"));

    expect(out.get("sv4-1")?.prices.normal.market).toBe(10);
    expect(provider.calls).toHaveLength(0);
  });

  it("refetches a stale cached row", async () => {
    const cache = [{
      card_api_id: "sv4-1", game: "pokemon", prices: price(10).prices, source: "pokemon_tcg",
      tcgplayer_id: null, tcgplayer_url: null,
      updated_at: new Date(NOW - 7 * 60 * 60 * 1000).toISOString(), // 7h old → stale
    }];
    const provider = new FakeProvider({ source: "pokemon_tcg", behavior: () => new Map([["sv4-1", price(20)]]) });
    const engine = new PriceFetchEngine(mockDb(cache) as any, { providers: [provider], now: () => NOW });

    const out = await engine.getPrices(refs("sv4-1"));
    expect(out.get("sv4-1")?.prices.normal.market).toBe(20);
    expect(provider.calls).toHaveLength(1);
  });

  it("cascades to the next tier on a 429 and stops using the dead provider", async () => {
    const tier1 = new FakeProvider({
      source: "justtcg",
      behavior: () => { throw new PriceProviderError(429, "rate limited"); },
    });
    const tier2 = new FakeProvider({ source: "pokemon_tcg", behavior: (c) => new Map(c.map((r) => [r.apiId, price(5)])) });
    const engine = new PriceFetchEngine(mockDb() as any, { providers: [tier1, tier2], now: () => NOW });

    const out = await engine.getPrices(refs("a", "b"));
    expect(out.get("a")?.source).toBe("pokemon_tcg");
    expect(out.get("b")?.source).toBe("pokemon_tcg");
  });

  it("cascades ids that a provider simply does not return (no 404 short-circuit)", async () => {
    const tier1 = new FakeProvider({ source: "justtcg", behavior: () => new Map([["a", price(3)]]) }); // 'b' absent
    const tier2 = new FakeProvider({ source: "pokemon_tcg", behavior: (c) => new Map(c.map((r) => [r.apiId, price(9)])) });
    const engine = new PriceFetchEngine(mockDb() as any, { providers: [tier1, tier2], now: () => NOW });

    const out = await engine.getPrices(refs("a", "b"));
    expect(out.get("a")?.source).toBe("justtcg"); // resolved by tier 1
    expect(out.get("b")?.source).toBe("pokemon_tcg"); // cascaded to tier 2
  });

  it("chunks stale ids by the provider batchSize", async () => {
    const provider = new FakeProvider({
      source: "pokemon_tcg", batchSize: 2,
      behavior: (c) => new Map(c.map((r) => [r.apiId, price(1)])),
    });
    const engine = new PriceFetchEngine(mockDb() as any, { providers: [provider], now: () => NOW });

    await engine.getPrices(refs("a", "b", "c", "d", "e"));
    expect(provider.calls.map((c) => c.length)).toEqual([2, 2, 1]);
  });

  it("backs off a capped provider for the day after an over-limit error (pins usage to cap)", async () => {
    const tier1 = new FakeProvider({
      source: "justtcg", cap: 100,
      behavior: () => { throw new PriceProviderError(429, "over limit"); },
    });
    const tier2 = new FakeProvider({ source: "pokemon_tcg", behavior: (c) => new Map(c.map((r) => [r.apiId, price(5)])) });
    const db = mockDb([], []);
    const engine = new PriceFetchEngine(db as any, { providers: [tier1, tier2], now: () => NOW });

    const out = await engine.getPrices(refs("a"));

    expect(out.get("a")?.source).toBe("pokemon_tcg"); // cascaded to bedrock this run
    const justtcg = db.writes.usage.find((u: any) => u.provider === "justtcg");
    expect(justtcg?.request_count).toBe(100);          // pinned to cap → skipped rest of day
  });

  it("persists the raw payload to card_prices and appends a snapshot for each fresh fetch", async () => {
    const raw = { variants: [{ condition: "Near Mint", printing: "Holofoil", price: 20, priceChange7d: 5, priceHistory: [{ p: 19, t: 1 }] }] };
    const payload: PricePayload = { prices: price(20).prices, raw };
    const provider = new FakeProvider({ source: "justtcg", behavior: (c) => new Map(c.map((r) => [r.apiId, payload])) });
    const db = mockDb();
    const engine = new PriceFetchEngine(db as any, { providers: [provider], now: () => NOW });

    await engine.getPrices(refs("sv4-1"));

    const cached = db.writes.cardPrices.find((r: any) => r.card_api_id === "sv4-1");
    expect(cached.raw).toEqual(raw);                       // full payload on the cache row
    expect(db.writes.snapshots).toHaveLength(1);           // one archived snapshot
    expect(db.writes.snapshots[0]).toMatchObject({ card_api_id: "sv4-1", game: "pokemon", source: "justtcg", raw });
  });

  it("does not archive a snapshot when the payload carried no raw", async () => {
    const provider = new FakeProvider({ source: "pokemon_tcg", behavior: (c) => new Map(c.map((r) => [r.apiId, price(5)])) });
    const db = mockDb();
    const engine = new PriceFetchEngine(db as any, { providers: [provider], now: () => NOW });

    await engine.getPrices(refs("a"));
    expect(db.writes.snapshots).toHaveLength(0);
  });

  it("respects the daily request budget and skips a provider once its cap is hit", async () => {
    const tier1 = new FakeProvider({
      source: "justtcg", cap: 1,
      behavior: (c) => new Map(c.map((r) => [r.apiId, price(2)])),
    });
    const tier2 = new FakeProvider({ source: "pokemon_tcg", behavior: (c) => new Map(c.map((r) => [r.apiId, price(8)])) });
    // tier1 already used its 1 allowed request today.
    const usage = [{ provider: "justtcg", request_count: 1 }];
    const engine = new PriceFetchEngine(mockDb([], usage) as any, { providers: [tier1, tier2], now: () => NOW });

    const out = await engine.getPrices(refs("a"));
    expect(out.get("a")?.source).toBe("pokemon_tcg"); // tier1 over budget → bedrock
  });

  it("skips a provider whose month-to-date usage has hit the monthly cap (even with daily room left)", async () => {
    const tier1 = new FakeProvider({
      source: "justtcg", cap: 1000, monthlyCap: 10,
      behavior: (c) => new Map(c.map((r) => [r.apiId, price(2)])),
    });
    const tier2 = new FakeProvider({ source: "pokemon_tcg", behavior: (c) => new Map(c.map((r) => [r.apiId, price(8)])) });
    // Month-to-date already at 10 (= monthly cap); daily (1000) has plenty of room.
    const usage = [{ provider: "justtcg", request_count: 10 }];
    const engine = new PriceFetchEngine(mockDb([], usage) as any, { providers: [tier1, tier2], now: () => NOW });

    const out = await engine.getPrices(refs("a"));
    expect(out.get("a")?.source).toBe("pokemon_tcg"); // tier1 over MONTHLY budget → bedrock
  });
});
