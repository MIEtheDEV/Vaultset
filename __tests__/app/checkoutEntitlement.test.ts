/**
 * @jest-environment node
 *
 * `next/server` touches the WHATWG `Request` global at import time, which the
 * project-default jsdom environment doesn't provide.
 */

// The checkout route must reject on *entitlement*, not on the raw `is_pro`
// flag. A one-time purchase leaves `is_pro: true` forever — only
// `pro_expires_at` + `pro_auto_renews` mark it dead — so a flag check locked
// expired one-time payers out of ever buying again (they saw "Already
// subscribed" on a plan they no longer had). Guard both directions.

process.env.STRIPE_PRICE_SINGLE     = "price_single";
process.env.STRIPE_PRICE_MONTHLY    = "price_monthly";
process.env.STRIPE_PRICE_QUARTERLY  = "price_quarterly";
process.env.STRIPE_PRICE_SEMIANNUAL = "price_semiannual";
process.env.STRIPE_PRICE_ANNUAL     = "price_annual";

const getUser        = jest.fn();
const single         = jest.fn();
const update         = jest.fn(() => ({ eq: jest.fn() }));
const createSession  = jest.fn();
const createCustomer = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser } })),
}));
jest.mock("@/utils/supabase/admin", () => ({
  createAdminClient: jest.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ single }) }),
      update,
    }),
  })),
}));
jest.mock("@/utils/stripe", () => ({
  stripe: {
    customers: { create: (...a: unknown[]) => createCustomer(...a) },
    checkout: { sessions: { create: (...a: unknown[]) => createSession(...a) } },
  },
}));

// Loaded lazily, not statically imported: the route builds its PRICE_IDS map at
// module scope, and a top-level `import` is hoisted above the env assignments
// above — leaving every plan id undefined, so every request 400s as invalid.
let POST: typeof import("@/app/api/stripe/checkout/route")["POST"];
beforeAll(async () => {
  ({ POST } = await import("@/app/api/stripe/checkout/route"));
});

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST   = new Date(Date.now() - 86_400_000).toISOString();

function req(plan: string) {
  return { json: async () => ({ plan }) } as never;
}

beforeEach(() => {
  getUser.mockReset();
  single.mockReset();
  createSession.mockReset();
  createCustomer.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1", email: "u@example.com" } } });
  createSession.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
});

describe("POST /api/stripe/checkout — entitlement gate", () => {
  it("rejects an active subscriber", async () => {
    single.mockResolvedValue({
      data: { stripe_customer_id: "cus_1", is_pro: true, pro_plan: "subscription", pro_auto_renews: true, pro_expires_at: FUTURE },
    });

    const res = await POST(req("annual"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Already subscribed" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a one-time payer still inside their 30 days", async () => {
    single.mockResolvedValue({
      data: { stripe_customer_id: "cus_1", is_pro: true, pro_plan: "one_time", pro_auto_renews: false, pro_expires_at: FUTURE },
    });

    const res = await POST(req("single"));
    expect(res.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("lets an EXPIRED one-time payer buy again despite is_pro still being true", async () => {
    single.mockResolvedValue({
      data: { stripe_customer_id: "cus_1", is_pro: true, pro_plan: "one_time", pro_auto_renews: false, pro_expires_at: PAST },
    });

    const res = await POST(req("single"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/s" });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "payment" }));
  });

  it("lets a free user subscribe", async () => {
    single.mockResolvedValue({ data: { stripe_customer_id: "cus_1", is_pro: false } });

    const res = await POST(req("monthly"));
    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "subscription" }));
  });

  it("rejects an unauthenticated caller before touching Stripe", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(req("monthly"));
    expect(res.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });
});
