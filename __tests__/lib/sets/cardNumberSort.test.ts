import { compareCardNumbers } from "@/lib/sets/cardNumberSort";

const sorted = (nums: string[]) => [...nums].sort(compareCardNumbers);

describe("compareCardNumbers", () => {
  it("orders plain numbers numerically, not lexicographically", () => {
    // The bug this exists to fix: a text sort reads 1, 10, 100, 101, ... 11, 110.
    expect(sorted(["11", "1", "110", "100", "2", "10", "101"])).toEqual([
      "1", "2", "10", "11", "100", "101", "110",
    ]);
  });

  it("orders within an alpha prefix numerically", () => {
    expect(sorted(["tg12", "tg2", "tg1", "tg10"])).toEqual(["tg1", "tg2", "tg10", "tg12"]);
  });

  it("puts lettered subsets after the main numbered run", () => {
    // TG / GG / SV gallery cards belong at the end of the binder, not interleaved.
    expect(sorted(["tg1", "250", "gg01", "1"])).toEqual(["1", "250", "gg01", "tg1"]);
  });

  it("keeps a lettered variant next to its base number", () => {
    expect(sorted(["29", "28a", "28", "27"])).toEqual(["27", "28", "28a", "29"]);
  });

  it("orders the ex10 Unown run after the numbers", () => {
    expect(sorted(["c", "a", "5", "b", "1"])).toEqual(["1", "5", "a", "b", "c"]);
  });

  it("is a total order over the catalog's odd shapes", () => {
    // ex10 also contains "!" and "?" Unown. Whatever position they take, sorting
    // must be deterministic and must not throw.
    const odd = ["?", "z", "!", "1", "10", "a"];
    expect(sorted(odd)).toEqual(sorted([...odd].reverse()));
  });

  it("treats null and undefined as empty, sorting them first", () => {
    expect(compareCardNumbers(null, "1")).toBeLessThan(0);
    expect(compareCardNumbers(undefined, "1")).toBeLessThan(0);
    expect(compareCardNumbers(null, undefined)).toBe(0);
  });
});
