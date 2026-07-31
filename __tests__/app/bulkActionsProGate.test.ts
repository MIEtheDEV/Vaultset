// Regression guard for leak C1: on-demand market refresh is a Pro feature and
// must be enforced server-side, not just disabled in the UI. Server actions are
// directly callable, and this path spends the paid price-API budget, so a
// non-Pro caller must be rejected before any work (or any API spend) happens.

const getUser = jest.fn();
const isPro = jest.fn();
const rpc = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser }, rpc })),
}));
jest.mock("@/utils/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/isPro", () => ({ isPro: (id: string) => isPro(id) }));

import {
  refreshItemMarketValue,
  applyBulkEdit,
  undoBulkEdit,
  previewBulkEdit,
} from "@/app/inventory/bulk-actions";

beforeEach(() => {
  getUser.mockReset();
  isPro.mockReset();
  rpc.mockReset();
});

describe("refreshItemMarketValue — server-side Pro gate (C1)", () => {
  it("rejects a free (non-Pro) authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "free-user" } } });
    isPro.mockResolvedValue(false);

    await expect(refreshItemMarketValue("item-1")).rejects.toThrow(/Pro feature/);
    expect(isPro).toHaveBeenCalledWith("free-user");
  });

  it("rejects an unauthenticated caller before consulting Pro status", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(refreshItemMarketValue("item-1")).rejects.toThrow(/Not authenticated/);
    expect(isPro).not.toHaveBeenCalled();
  });
});

// Bulk edit writes across a whole collection from a predicate the client
// supplies. Same reasoning as C1: a UI-only paywall is no paywall, because the
// server action is directly callable with any filter.

describe("bulk edit — server-side Pro gate", () => {
  it("rejects a free user applying a bulk edit, before touching the database", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "free-user" } } });
    isPro.mockResolvedValue(false);

    await expect(
      applyBulkEdit({ sets: ["Pitch Black"] }, { type: "price_market_pct", pct: -5 }),
    ).rejects.toThrow(/Pro feature/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a free user undoing a bulk edit", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "free-user" } } });
    isPro.mockResolvedValue(false);

    await expect(undoBulkEdit("batch-1")).rejects.toThrow(/Pro feature/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller before consulting Pro status", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(applyBulkEdit({}, { type: "clear_list_price" })).rejects.toThrow(/Not authenticated/);
    expect(isPro).not.toHaveBeenCalled();
  });

  it("validates the action before spending a Pro check or a query", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "pro-user" } } });
    isPro.mockResolvedValue(true);

    await expect(applyBulkEdit({}, { type: "drop_table" })).rejects.toThrow(/Unknown bulk action/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets a free user preview — the paywall is on apply, not on looking", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "free-user" } } });
    rpc.mockResolvedValue({ data: { matched: 12, locked: 1, applicable: 11 }, error: null });

    const preview = await previewBulkEdit({ rarities: ["common"] }, { type: "set_for_sale", value: true });

    expect(preview.applicable).toBe(11);
    expect(isPro).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("bulk_edit_preview", {
      p_filter: { rarities: ["common"] },
      p_action: { type: "set_for_sale", value: true },
    });
  });

  it("passes only the normalized filter to the database", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "pro-user" } } });
    isPro.mockResolvedValue(true);
    rpc.mockResolvedValue({ data: { batchId: "b1", updated: 3 }, error: null });

    // Empty arrays and unknown keys must not reach the query.
    await applyBulkEdit(
      { sets: [], rarities: ["common"], bogus: "ignored" },
      { type: "price_market_pct", pct: -5, floor: 0.25, round: "cent" },
    );

    expect(rpc).toHaveBeenCalledWith("bulk_edit_apply", {
      p_filter: { rarities: ["common"] },
      p_action: { type: "price_market_pct", pct: -5, floor: 0.25, round: "cent" },
    });
  });
});
