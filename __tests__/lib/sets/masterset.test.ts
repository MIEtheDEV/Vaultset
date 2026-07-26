import type { SupabaseClient } from "@supabase/supabase-js";
import { getSetCompletionSummaries, loadOwnedIndex } from "@/lib/sets/masterset";

// pokemontcg.io set metadata is a network call; the completion maths doesn't
// depend on it beyond display names.
jest.mock("@/lib/sets/getPokemonSets", () => ({
  getPokemonSets: async () => new Map(),
}));

// PostgREST caps EVERY response at this many rows and reports no truncation.
// The fake client below enforces the same cap, so a query that fails to page
// loses rows here exactly as it did in production.
const PG_MAX_ROWS = 1000;

interface CatalogRow { set_code: string; card_number: string; finishes: string[] }
interface ItemRow { id: string; finish: string | null; cards: { set_code: string; set_name: null; card_number: string } }

/** Minimal stand-in for the PostgREST query builder: collects filters, applies
 *  the row cap, and resolves like a promise. */
function makeClient(catalog: CatalogRow[], items: ItemRow[]) {
  const requests: { table: string; from: number; to: number }[] = [];

  const builder = (table: string) => {
    let rows: unknown[] = table === "set_cards" ? [...catalog] : [...items];
    const api = {
      select: () => api,
      eq: (col: string, val: string) => {
        if (table === "set_cards" && col === "set_code") {
          rows = (rows as CatalogRow[]).filter((r) => r.set_code === val);
        }
        return api;
      },
      in: (col: string, vals: string[]) => {
        if (col === "set_code") rows = (rows as CatalogRow[]).filter((r) => vals.includes(r.set_code));
        return api;
      },
      order: () => api,
      range: (from: number, to: number) => {
        requests.push({ table, from, to });
        // The cap applies to the WINDOW, mirroring PostgREST.
        const window = rows.slice(from, Math.min(to + 1, from + PG_MAX_ROWS));
        return Promise.resolve({ data: window, error: null });
      },
      // Un-ranged reads still get capped — the original bug.
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows.slice(0, PG_MAX_ROWS), error: null }),
    };
    return api;
  };

  const client = {
    from: (table: string) => builder(table),
    rpc: async (name: string) => {
      if (name !== "set_completion_totals") return { data: [], error: null };
      const bySet = new Map<string, { complete: number; master: number }>();
      for (const r of catalog) {
        const cur = bySet.get(r.set_code) ?? { complete: 0, master: 0 };
        cur.complete += 1;
        cur.master += r.finishes.length;
        bySet.set(r.set_code, cur);
      }
      return {
        data: [...bySet].map(([set_code, v]) => ({
          set_code, set_name: set_code, complete_total: v.complete, master_total: v.master, has_partial: false,
        })),
        error: null,
      };
    },
  };
  return { client: client as unknown as SupabaseClient, requests };
}

/** 12 sets × 200 cards = 2,400 catalog rows — well past the 1,000-row cap, the
 *  same shape as a real collector who has dipped into a dozen modern sets. */
function buildCatalog(): CatalogRow[] {
  const out: CatalogRow[] = [];
  for (let s = 0; s < 12; s++) {
    for (let n = 1; n <= 200; n++) {
      out.push({ set_code: `set${s}`, card_number: String(n), finishes: ["non_holo", "reverse_holofoil"] });
    }
  }
  return out;
}

describe("getSetCompletionSummaries", () => {
  it("counts progress in EVERY touched set, not just those inside the first page", async () => {
    const catalog = buildCatalog();
    // One owned card in each of the 12 sets.
    const items: ItemRow[] = Array.from({ length: 12 }, (_, s) => ({
      id: `i${s}`,
      finish: "non_holo",
      cards: { set_code: `set${s}`, set_name: null, card_number: "1" },
    }));

    const { client } = makeClient(catalog, items);
    const summaries = await getSetCompletionSummaries(client, "u1");

    const withProgress = summaries.filter((s) => s.complete.owned > 0);
    // Before paging, sets whose catalog rows fell past row 1,000 came back with
    // no finish data and silently scored 0 — the "0 cards / no progress" bug.
    expect(withProgress).toHaveLength(12);
    for (const s of withProgress) {
      expect(s.complete).toEqual({ owned: 1, total: 200 });
      expect(s.master.owned).toBe(1);
      expect(s.master.total).toBe(400);
    }
  });

  it("pages the catalog read until it is exhausted", async () => {
    // Touch all 12 sets so the catalog read spans 2,400 rows — 3 pages.
    const items: ItemRow[] = Array.from({ length: 12 }, (_, s) => ({
      id: `i${s}`,
      finish: "non_holo",
      cards: { set_code: `set${s}`, set_name: null, card_number: "1" },
    }));
    const { client, requests } = makeClient(buildCatalog(), items);
    await getSetCompletionSummaries(client, "u1");
    const catalogReads = requests.filter((r) => r.table === "set_cards");
    expect(catalogReads).toHaveLength(3);
    expect(catalogReads[0]).toMatchObject({ from: 0, to: 999 });
    expect(catalogReads[2]).toMatchObject({ from: 2000, to: 2999 });
  });

  it("never reports owning more finishes than the set contains", async () => {
    const catalog = buildCatalog();
    const items: ItemRow[] = [
      { id: "a", finish: "non_holo", cards: { set_code: "set0", set_name: null, card_number: "1" } },
      { id: "b", finish: "reverse_holofoil", cards: { set_code: "set0", set_name: null, card_number: "1" } },
      // A printing the catalog doesn't list — widens both sides of the ratio.
      { id: "c", finish: "holofoil", cards: { set_code: "set0", set_name: null, card_number: "1" } },
    ];
    const { client } = makeClient(catalog, items);
    const set0 = (await getSetCompletionSummaries(client, "u1")).find((s) => s.setCode === "set0")!;
    expect(set0.master.owned).toBe(3);
    expect(set0.master.total).toBe(401); // 400 catalog slots + the proven holo
    expect(set0.master.owned).toBeLessThanOrEqual(set0.master.total);
  });
});

describe("loadOwnedIndex", () => {
  it("reads the whole collection, not just the first 1,000 lots", async () => {
    // 1,500 lots across 2 sets — a plausible serious collection, past the cap.
    const items: ItemRow[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `i${String(i).padStart(5, "0")}`,
      finish: "non_holo",
      cards: { set_code: i < 750 ? "set0" : "set1", set_name: null, card_number: String((i % 200) + 1) },
    }));
    const { client } = makeClient(buildCatalog(), items);
    const idx = await loadOwnedIndex(client, "u1");
    expect([...idx.touchedCodes].sort()).toEqual(["set0", "set1"]);
    // Both halves survived: set1's lots all live past row 1,000.
    expect(idx.bySet.get("set1")!.size).toBeGreaterThan(0);
  });
});
