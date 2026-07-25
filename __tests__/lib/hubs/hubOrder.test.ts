import { byCardNumber, byReleaseDesc, type OrderableCard } from "@/lib/hubs/hubOrder";

const card = (o: Partial<OrderableCard> & { apiId: string }): OrderableCard => ({
  setCode: null,
  number: null,
  releaseDate: null,
  ...o,
});

describe("byCardNumber", () => {
  it("orders numeric collector numbers numerically, not lexically", () => {
    const out = [card({ apiId: "a", number: "117" }), card({ apiId: "b", number: "4" })]
      .sort(byCardNumber)
      .map((c) => c.number);
    expect(out).toEqual(["4", "117"]);
  });

  it("places non-numeric promo numbers after numeric ones", () => {
    const out = [
      card({ apiId: "a", number: "swsh108" }),
      card({ apiId: "b", number: "40" }),
      card({ apiId: "c", number: "dp11" }),
    ]
      .sort(byCardNumber)
      .map((c) => c.number);
    expect(out).toEqual(["40", "dp11", "swsh108"]);
  });
});

describe("byReleaseDesc", () => {
  it("orders newest set first", () => {
    const out = [
      card({ apiId: "dp1-4", releaseDate: "2007-05-01" }),
      card({ apiId: "me2-114", releaseDate: "2025-11-14" }),
      card({ apiId: "swsh5-40", releaseDate: "2021-03-19" }),
    ]
      .sort(byReleaseDesc)
      .map((c) => c.apiId);
    expect(out).toEqual(["me2-114", "swsh5-40", "dp1-4"]);
  });

  it("sorts cards with no release date to the tail", () => {
    const out = [
      card({ apiId: "tcg:999" }),
      card({ apiId: "dp1-4", releaseDate: "2007-05-01" }),
    ]
      .sort(byReleaseDesc)
      .map((c) => c.apiId);
    expect(out).toEqual(["dp1-4", "tcg:999"]);
  });

  it("groups same-day releases by set, then by card number", () => {
    const out = [
      card({ apiId: "swsh11tg-TG02", setCode: "swsh11tg", number: "tg02", releaseDate: "2022-09-09" }),
      card({ apiId: "swsh11-100", setCode: "swsh11", number: "100", releaseDate: "2022-09-09" }),
      card({ apiId: "swsh11-9", setCode: "swsh11", number: "9", releaseDate: "2022-09-09" }),
    ]
      .sort(byReleaseDesc)
      .map((c) => c.apiId);
    expect(out).toEqual(["swsh11-9", "swsh11-100", "swsh11tg-TG02"]);
  });

  // The property that actually fixes the bug: no pair may compare equal, so the
  // rendered order can never fall through to the DB's (unordered) row order.
  it("is a total order — no two distinct cards ever tie", () => {
    const cards = [
      card({ apiId: "a", setCode: "sv1", number: "1", releaseDate: "2023-03-31" }),
      card({ apiId: "b", setCode: "sv1", number: "1", releaseDate: "2023-03-31" }), // same set+number
      card({ apiId: "c", setCode: "sv1", number: null, releaseDate: "2023-03-31" }),
      card({ apiId: "d", setCode: null, number: null, releaseDate: null }),
      card({ apiId: "e", setCode: null, number: null, releaseDate: null }),
    ];
    for (const x of cards) {
      for (const y of cards) {
        if (x.apiId === y.apiId) continue;
        expect(byReleaseDesc(x, y)).not.toBe(0);
      }
    }
  });

  it("produces the same order regardless of input order", () => {
    const cards = [
      card({ apiId: "me2-114", setCode: "me2", number: "114", releaseDate: "2025-11-14" }),
      card({ apiId: "dp1-120", setCode: "dp1", number: "120", releaseDate: "2007-05-01" }),
      card({ apiId: "dp1-4", setCode: "dp1", number: "4", releaseDate: "2007-05-01" }),
      card({ apiId: "tcg:1" }),
    ];
    const expected = [...cards].sort(byReleaseDesc).map((c) => c.apiId);
    expect([...cards].reverse().sort(byReleaseDesc).map((c) => c.apiId)).toEqual(expected);
    expect([cards[2], cards[0], cards[3], cards[1]].sort(byReleaseDesc).map((c) => c.apiId)).toEqual(expected);
  });
});
