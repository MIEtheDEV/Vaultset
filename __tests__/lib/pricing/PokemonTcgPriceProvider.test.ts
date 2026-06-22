import { PokemonTcgPriceProvider } from "@/lib/pricing/PokemonTcgPriceProvider";
import type { FetchContext } from "@/lib/pricing/PriceProvider";

const ctx: FetchContext = { allowResolve: false, recordRequest: async () => true };

// Regression: bedrock queries pokemontcg.io with `id:<apiId> OR ...`. JustTCG
// (`tcg:<id>`) and manual (`manual:<id>`) keys contain a colon that breaks the
// Lucene query and 400s the WHOLE batch — observed in prod as bedrock returning
// nothing for an entire 24-card collection because 2 cards were non-native.
describe("PokemonTcgPriceProvider native-id filtering", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  function mockOk(cards: { id: string; tcgplayer?: unknown }[]) {
    let capturedUrl = "";
    global.fetch = jest.fn(async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ({ data: cards }) };
    }) as unknown as typeof fetch;
    return () => capturedUrl;
  }

  it("excludes tcg:/manual: ids from the query so they can't poison the batch", async () => {
    const getUrl = mockOk([
      { id: "sv4-1", tcgplayer: { prices: { normal: { market: 5 } }, url: "u" } },
    ]);
    const provider = new PokemonTcgPriceProvider();
    const out = await provider.fetchBatch(
      [
        { apiId: "sv4-1" },          // native — queried
        { apiId: "tcg:88075" },      // JustTCG — must be filtered out
        { apiId: "manual:abc-123" }, // manual — must be filtered out
      ],
      ctx,
    );

    const url = decodeURIComponent(getUrl());
    expect(url).toContain("id:sv4-1");
    expect(url).not.toContain("tcg:88075");
    expect(url).not.toContain("manual:abc-123");
    expect(out.get("sv4-1")?.prices.normal.market).toBe(5);
  });

  it("makes no request when every card is non-native (nothing to look up)", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const provider = new PokemonTcgPriceProvider();
    const out = await provider.fetchBatch([{ apiId: "tcg:1" }, { apiId: "manual:2" }], ctx);
    expect(out.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
