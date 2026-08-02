import {
  cardLabel,
  formatReleaseMonth,
  formatUsd,
  joinList,
  mostValuable,
  parseReleaseDate,
  releaseYear,
  speciesSpan,
  type FactCard,
} from "@/lib/hubs/hubFacts";

const card = (o: Partial<FactCard> = {}): FactCard => ({
  name: "Pikachu",
  setName: "Base",
  number: null,
  value: null,
  releaseDate: null,
  ...o,
});

describe("parseReleaseDate", () => {
  // pokemontcg.io emits YYYY/MM/DD, set_cards.release_date is ISO — both reach these helpers.
  it("accepts both the slash and ISO date shapes", () => {
    expect(parseReleaseDate("2003/09/18")).toEqual({ year: 2003, month: 9 });
    expect(parseReleaseDate("2003-09-18")).toEqual({ year: 2003, month: 9 });
  });

  it("returns null for missing or malformed dates", () => {
    expect(parseReleaseDate(null)).toBeNull();
    expect(parseReleaseDate("")).toBeNull();
    expect(parseReleaseDate("soon")).toBeNull();
    expect(parseReleaseDate("2003/13/01")).toBeNull();
  });
});

describe("formatReleaseMonth", () => {
  it("renders an English month and year", () => {
    expect(formatReleaseMonth("2003/09/18")).toBe("September 2003");
    expect(formatReleaseMonth("1999-01-09")).toBe("January 1999");
  });

  it("returns null rather than a partial string when the date is unusable", () => {
    expect(formatReleaseMonth(null)).toBeNull();
  });
});

describe("releaseYear", () => {
  it("extracts the year", () => {
    expect(releaseYear("2003/09/18")).toBe(2003);
    expect(releaseYear(undefined)).toBeNull();
  });
});

describe("mostValuable", () => {
  it("picks the highest priced card", () => {
    const top = mostValuable([
      card({ name: "Ekans", value: 1.5 }),
      card({ name: "Charizard", value: 420 }),
      card({ name: "Koffing", value: 2 }),
    ]);
    expect(top?.name).toBe("Charizard");
  });

  // Only ~3% of checklist cards carry a price row, so the unpriced case is the common one.
  it("ignores unpriced cards and returns null when nothing is priced", () => {
    expect(mostValuable([card({ value: null }), card({ value: null })])).toBeNull();
    expect(mostValuable([])).toBeNull();
    expect(mostValuable([card({ name: "Zubat", value: null }), card({ name: "Onix", value: 3 })])?.name)
      .toBe("Onix");
  });
});

describe("speciesSpan", () => {
  it("reports the year range and distinct set count", () => {
    expect(
      speciesSpan([
        card({ setName: "Base", releaseDate: "1999-01-09" }),
        card({ setName: "Fossil", releaseDate: "1999-10-10" }),
        card({ setName: "Obsidian Flames", releaseDate: "2023-08-11" }),
      ]),
    ).toEqual({ firstYear: 1999, lastYear: 2023, setCount: 3 });
  });

  it("survives cards with no release date (JustTCG-sourced promos)", () => {
    expect(speciesSpan([card({ setName: "Promo", releaseDate: null })])).toEqual({
      firstYear: null,
      lastYear: null,
      setCount: 1,
    });
  });
});

describe("formatUsd / cardLabel / joinList", () => {
  it("formats money to two places", () => {
    expect(formatUsd(4)).toBe("$4.00");
    expect(formatUsd(1234.5)).toBe("$1234.50");
  });

  it("appends the collector number only when there is one", () => {
    expect(cardLabel(card({ name: "Charizard", number: "4" }))).toBe("Charizard (#4)");
    expect(cardLabel(card({ name: "Charizard", number: null }))).toBe("Charizard");
  });

  it("joins lists in readable English", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["Base"])).toBe("Base");
    expect(joinList(["Base", "Fossil"])).toBe("Base and Fossil");
    expect(joinList(["Base", "Fossil", "Jungle"])).toBe("Base, Fossil, and Jungle");
  });
});
