// Regression guard for leak C1: on-demand market refresh is a Pro feature and
// must be enforced server-side, not just disabled in the UI. Server actions are
// directly callable, and this path spends the paid price-API budget, so a
// non-Pro caller must be rejected before any work (or any API spend) happens.

const getUser = jest.fn();
const isPro = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser } })),
}));
jest.mock("@/utils/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/isPro", () => ({ isPro: (id: string) => isPro(id) }));

import { refreshItemMarketValue } from "@/app/inventory/bulk-actions";

beforeEach(() => {
  getUser.mockReset();
  isPro.mockReset();
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
