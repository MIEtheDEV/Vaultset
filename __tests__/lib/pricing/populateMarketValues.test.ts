const getPricesGapAware = jest.fn();
const propagate = jest.fn();

jest.mock("@/lib/pricing/PriceFetchEngine", () => ({
  PriceFetchEngine: jest.fn().mockImplementation(() => ({ getPricesGapAware })),
}));
jest.mock("@/lib/pricing/propagateMarketValues", () => ({
  propagateMarketValues: (...args: unknown[]) => propagate(...args),
}));

import { populateMarketValues } from "@/lib/pricing/populateMarketValues";

const admin = {} as never;

beforeEach(() => {
  getPricesGapAware.mockReset().mockResolvedValue(new Map());
  propagate.mockReset().mockResolvedValue(3);
});

describe("populateMarketValues", () => {
  it("no-ops on empty refs (no fetch, no propagation)", async () => {
    expect(await populateMarketValues(admin, [])).toBe(0);
    expect(getPricesGapAware).not.toHaveBeenCalled();
    expect(propagate).not.toHaveBeenCalled();
  });

  it("resolves gap-aware (bedrock, then JustTCG for gaps) and propagates distinct apiIds", async () => {
    const refs = [
      { apiId: "sv4-1" },
      { apiId: "sv4-1" },     // duplicate — must be de-duped before propagation
      { apiId: "tcg:88075" },
    ];

    const updated = await populateMarketValues(admin, refs);

    expect(getPricesGapAware).toHaveBeenCalledWith(refs);
    expect(propagate).toHaveBeenCalledWith(admin, ["sv4-1", "tcg:88075"]);
    expect(updated).toBe(3);
  });
});
