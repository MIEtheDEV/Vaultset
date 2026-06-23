import { JustTcgPriceProvider } from "@/lib/pricing/JustTcgPriceProvider";
import type { FetchContext } from "@/lib/pricing/PriceProvider";

const ctx: FetchContext = { allowResolve: true, recordRequest: async () => true };

// Two cards that share a name but not a number — the real bug: #268 was getting
// the #283 special-illustration-rare price.
const CANDIDATES = [
  { tcgplayerId: "id-283", name: "Mega Hawlucha ex", number: "283", set_name: "Mega Evolution",
    variants: [{ condition: "Near Mint", printing: "Holofoil", price: 74.30 }] },
  { tcgplayerId: "id-268", name: "Mega Hawlucha ex", number: "268", set_name: "Mega Evolution",
    variants: [{ condition: "Near Mint", printing: "Holofoil", price: 12.00 }] },
];

function mockSearch(candidates: unknown[]) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: candidates }),
  })) as unknown as typeof fetch;
}

describe("JustTcgPriceProvider resolution matching", () => {
  let provider: JustTcgPriceProvider;
  const realFetch = global.fetch;

  beforeEach(() => { provider = new JustTcgPriceProvider(); });
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  it("matches the exact collector number, not a same-name sibling", async () => {
    mockSearch(CANDIDATES);
    const out = await provider.fetchBatch(
      [{ apiId: "mega-268", name: "Mega Hawlucha ex", setName: "Mega Evolution", number: "268" }],
      ctx,
    );
    const payload = out.get("mega-268");
    expect(payload?.tcgplayerId).toBe("id-268");
    expect(payload?.prices.holofoil.market).toBe(12.00); // NOT 74.30
  });

  it("normalizes number formats (268 vs 268/191)", async () => {
    mockSearch([{ ...CANDIDATES[1], number: "268/191" }]);
    const out = await provider.fetchBatch(
      [{ apiId: "mega-268", name: "Mega Hawlucha ex", setName: "Mega Evolution", number: "268" }],
      ctx,
    );
    expect(out.get("mega-268")?.tcgplayerId).toBe("id-268");
  });

  it("returns nothing when no candidate's number matches (no guessing)", async () => {
    mockSearch(CANDIDATES); // only 283 and 268 exist
    const out = await provider.fetchBatch(
      [{ apiId: "mega-999", name: "Mega Hawlucha ex", setName: "Mega Evolution", number: "999" }],
      ctx,
    );
    expect(out.has("mega-999")).toBe(false);
  });

  it("returns nothing when we have no collector number to anchor on", async () => {
    mockSearch(CANDIDATES);
    const out = await provider.fetchBatch(
      [{ apiId: "mega-x", name: "Mega Hawlucha ex", setName: "Mega Evolution", number: undefined }],
      ctx,
    );
    expect(out.has("mega-x")).toBe(false);
  });
});

describe("JustTcgPriceProvider batch (mapped tcgplayerId)", () => {
  let provider: JustTcgPriceProvider;
  const realFetch = global.fetch;

  beforeEach(() => { provider = new JustTcgPriceProvider(); });
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  // Regression: JustTCG's batch endpoint requires a BARE ARRAY body. The code
  // previously sent { items: [...] }, which 400s — silently producing no prices
  // and burning quota (observed in prod: 47 calls / 2 days / 0 cache writes).
  it("POSTs a bare array of lookup objects, not an { items } envelope", async () => {
    let captured: { url: string; body: unknown } = { url: "", body: null };
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      captured = { url, body: JSON.parse(init.body as string) };
      return {
        ok: true, status: 200,
        json: async () => ({ data: [
          { tcgplayerId: "88075", name: "Pikachu", number: "086/110",
            variants: [
              { condition: "Near Mint",      printing: "Holofoil", price: 10 },
              { condition: "Lightly Played", printing: "Holofoil", price: 7 },
            ] },
        ] }),
      };
    }) as unknown as typeof fetch;

    const out = await provider.fetchBatch([{ apiId: "base-25", tcgplayerId: "88075", name: "Pikachu" }], ctx);

    expect(captured.url).toMatch(/\/cards$/);
    expect(Array.isArray(captured.body)).toBe(true);                 // NOT { items: [...] }
    expect(captured.body).toEqual([{ tcgplayerId: "88075" }]);

    // And it parses real per-condition prices off the returned variants.
    const payload = out.get("base-25");
    expect(payload?.prices.holofoil.market).toBe(10);
    expect(payload?.conditionPrices?.holofoil).toEqual({ near_mint: 10, lightly_played: 7 });
  });
});
