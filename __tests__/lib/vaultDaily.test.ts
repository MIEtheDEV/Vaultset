import {
  computeDailyChanges,
  computeVaultPulse,
  pulseChange,
  unwrapCard,
  type VaultItem,
} from "@/lib/vaultDaily";

function item(over: Partial<VaultItem> & { id: string }): VaultItem {
  return {
    market_price: 10,
    quantity: 1,
    finish: null,
    condition: "near_mint",
    grader: null,
    cards: {
      id: `card-${over.id}`,
      name: `Card ${over.id}`,
      set_name: "Test Set",
      card_number: "1",
      image_url: null,
      game_data: {},
    },
    ...over,
  };
}

describe("unwrapCard", () => {
  it("handles both the object and single-element-array relation shapes", () => {
    const card = { id: "c", name: "n", set_name: null, card_number: null, image_url: null, game_data: null };
    expect(unwrapCard(card)).toBe(card);
    expect(unwrapCard([card])).toBe(card);
    expect(unwrapCard([])).toBeNull();
    expect(unwrapCard(null)).toBeNull();
  });
});

const NOW = Date.parse("2026-08-01T13:00:00Z");
const HOURS_AGO = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

/** A JustTCG-shaped `card_prices` row for the near-mint normal variant. */
function priced(price: number, change24hr: number, ageHours: number) {
  return {
    raw: { variants: [{ condition: "Near Mint", printing: "Normal", price, priceChange24hr: change24hr }] },
    updatedAt: HOURS_AGO(ageHours),
  };
}

/** An item whose pricing identity is a pokemontcg.io api id, so it can key into card_prices. */
function apiItem(over: Partial<VaultItem> & { id: string }): VaultItem {
  return item({
    ...over,
    cards: {
      id: `card-${over.id}`,
      name: `Card ${over.id}`,
      set_name: "Test Set",
      card_number: "1",
      image_url: null,
      game_data: { pokemon_api_id: "sv1-1" },
    },
  });
}

describe("computeDailyChanges", () => {
  it("uses the snapshot diff", () => {
    const items = [item({ id: "a", market_price: 12 })];
    const changes = computeDailyChanges(items, new Map([["a", 10]]), new Map());

    expect(changes.a.abs).toBeCloseTo(2);
    expect(changes.a.pct).toBeCloseTo(20);
  });

  it("omits items with no prior snapshot and no provider data", () => {
    const changes = computeDailyChanges([item({ id: "a" })], new Map(), new Map());
    expect(changes).toEqual({});
  });

  it("omits items with a null market price", () => {
    const changes = computeDailyChanges(
      [item({ id: "a", market_price: null })],
      new Map([["a", 10]]),
      new Map(),
    );
    expect(changes).toEqual({});
  });

  it("does not divide by a zero prior value", () => {
    const changes = computeDailyChanges([item({ id: "a", market_price: 5 })], new Map([["a", 0]]), new Map());
    expect(changes).toEqual({});
  });

  it("prefers our snapshot diff over the provider 24h move", () => {
    // Keyed by the pricing identity, which for a pokemontcg.io card is its api id
    // (a card with no `pokemon_api_id` would key as `manual:<cardRowId>` instead).
    const items = [apiItem({ id: "a", market_price: 11 })];

    // Both sources are available and disagree. The snapshot is what the value chart
    // draws, so it wins — a digest that contradicts the chart reads as broken.
    const changes = computeDailyChanges(
      items,
      new Map([["a", 10]]),
      new Map([["sv1-1", priced(11, 10, 1)]]),
      NOW,
    );

    expect(changes.a.abs).toBeCloseTo(1);
    expect(changes.a.pct).toBeCloseTo(10);
  });

  it("uses a fresh provider 24h move for an item with no snapshot yet", () => {
    // A card added since the last 02:00 UTC run still gets a real ticker on day one.
    const items = [apiItem({ id: "a", market_price: 11 })];
    const changes = computeDailyChanges(items, new Map(), new Map([["sv1-1", priced(11, 10, 1)]]), NOW);

    expect(changes.a.pct).toBeCloseTo(10);
    expect(changes.a.abs).toBeCloseTo(1); // 11 - 11/1.1
  });

  it("ignores a provider 24h move from a stale card_prices row", () => {
    // The regression this guards: `priceChange24hr` measures the 24h before
    // `updated_at`, not before now. Nothing refreshes that row on a schedule, so a
    // cold one re-reported the same phantom move every day the digest ran.
    const items = [apiItem({ id: "a", market_price: 7.73 })];
    const changes = computeDailyChanges(
      items,
      new Map(),
      new Map([["sv1-1", priced(7.73, -12.36, 6 * 24)]]),
      NOW,
    );

    expect(changes).toEqual({});
  });

  it("treats a card_prices row right at the freshness boundary as usable", () => {
    const items = [apiItem({ id: "a", market_price: 11 })];
    const fresh = computeDailyChanges(items, new Map(), new Map([["sv1-1", priced(11, 10, 23.9)]]), NOW);
    const stale = computeDailyChanges(items, new Map(), new Map([["sv1-1", priced(11, 10, 24.1)]]), NOW);

    expect(fresh.a.pct).toBeCloseTo(10);
    expect(stale).toEqual({});
  });

  it("ignores a card_prices row with no timestamp at all", () => {
    const items = [apiItem({ id: "a", market_price: 11 })];
    const raw = { variants: [{ condition: "Near Mint", printing: "Normal", price: 11, priceChange24hr: 10 }] };
    const changes = computeDailyChanges(items, new Map(), new Map([["sv1-1", { raw, updatedAt: null }]]), NOW);

    expect(changes).toEqual({});
  });

  it("ignores provider data for graded slabs, which JustTCG does not cover", () => {
    const items = [apiItem({ id: "a", market_price: 11, grader: "PSA" })];
    const changes = computeDailyChanges(
      items,
      new Map(),
      new Map([["sv1-1", priced(11, 10, 1)]]),
      NOW,
    );

    expect(changes).toEqual({});
  });

  it("reports a real move once, then goes flat as the snapshot catches up", () => {
    // The property the provider path lacked: after the price settles, the next day's
    // snapshot equals today's price and the item drops out on its own.
    const items = [apiItem({ id: "a", market_price: 7.73 })];

    const dayOfMove = computeDailyChanges(items, new Map([["a", 8.65]]), new Map(), NOW);
    expect(dayOfMove.a.abs).toBeCloseTo(-0.92);

    const dayAfter = computeDailyChanges(items, new Map([["a", 7.73]]), new Map(), NOW);
    expect(dayAfter.a.abs).toBe(0);
  });
});

describe("computeVaultPulse", () => {
  it("weights the portfolio delta by quantity", () => {
    const items = [item({ id: "a", market_price: 12, quantity: 3 })];
    const pulse = computeVaultPulse(items, { a: { abs: 2, pct: 20 } });

    expect(pulse.singlesValue).toBeCloseTo(36);
    expect(pulse.changeAbs).toBeCloseTo(6); // 2 × 3
    // Baseline is (12 - 2) × 3 = 30, so 6/30 = 20%.
    expect(pulse.changePct).toBeCloseTo(20);
  });

  it("takes the percentage against only the items that had a change", () => {
    const items = [
      item({ id: "a", market_price: 12 }), // moved +2 from 10
      item({ id: "b", market_price: 500 }), // no data at all
    ];
    const pulse = computeVaultPulse(items, { a: { abs: 2, pct: 20 } });

    expect(pulse.singlesValue).toBeCloseTo(512);
    expect(pulse.changeAbs).toBeCloseTo(2);
    // 2/10 = 20%, not 2/510 — the uncovered $500 must not dilute it.
    expect(pulse.changePct).toBeCloseTo(20);
    expect(pulse.covered).toBe(1);
    expect(pulse.total).toBe(2);
  });

  it("reports no percentage when nothing had a computable change", () => {
    const pulse = computeVaultPulse([item({ id: "a" })], {});

    expect(pulse.changeAbs).toBe(0);
    expect(pulse.changePct).toBeNull();
    expect(pulse.covered).toBe(0);
    expect(pulseChange(pulse)).toBeNull();
  });

  it("splits movers by direction and ranks by weighted dollar move", () => {
    const items = [
      item({ id: "big", market_price: 100 }),
      item({ id: "small", market_price: 1 }),
      item({ id: "bulk", market_price: 5, quantity: 10 }),
      item({ id: "loser", market_price: 40 }),
    ];
    const pulse = computeVaultPulse(items, {
      big: { abs: 8, pct: 8 },
      small: { abs: 0.5, pct: 100 }, // huge percent, trivial dollars
      bulk: { abs: 1, pct: 25 }, // 1 × 10 copies = $10 weighted
      loser: { abs: -12, pct: -23 },
    });

    // bulk ($10) outranks big ($8), which outranks small ($0.50).
    expect(pulse.movers.up.map((m) => m.itemId)).toEqual(["bulk", "big", "small"]);
    expect(pulse.movers.down.map((m) => m.itemId)).toEqual(["loser"]);
  });

  it("respects the mover limit", () => {
    const items = [1, 2, 3, 4, 5].map((n) => item({ id: `i${n}`, market_price: 10 * n }));
    const changes = Object.fromEntries(items.map((it, i) => [it.id, { abs: i + 1, pct: 5 }]));

    expect(computeVaultPulse(items, changes, { moverLimit: 2 }).movers.up).toHaveLength(2);
  });

  it("drops sub-cent noise from the mover lists but keeps it in the total", () => {
    const items = [item({ id: "a", market_price: 10 })];
    const pulse = computeVaultPulse(items, { a: { abs: 0.001, pct: 0.01 } });

    expect(pulse.movers.up).toHaveLength(0);
    expect(pulse.covered).toBe(1);
  });

  it("carries card display fields onto movers, tolerating a missing relation", () => {
    const named = item({ id: "a", market_price: 12 });
    const orphan = item({ id: "b", market_price: 12, cards: null });
    const pulse = computeVaultPulse([named, orphan], {
      a: { abs: 2, pct: 20 },
      b: { abs: 3, pct: 30 },
    });

    const byId = Object.fromEntries(pulse.movers.up.map((m) => [m.itemId, m]));
    expect(byId.a.name).toBe("Card a");
    expect(byId.a.setName).toBe("Test Set");
    expect(byId.b.name).toBe("Unknown card");
  });

  it("handles an empty vault", () => {
    const pulse = computeVaultPulse([], {});
    expect(pulse).toMatchObject({ singlesValue: 0, changeAbs: 0, changePct: null, covered: 0, total: 0 });
    expect(pulse.movers.up).toEqual([]);
    expect(pulse.movers.down).toEqual([]);
  });
});
