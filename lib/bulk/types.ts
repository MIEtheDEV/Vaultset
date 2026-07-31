/**
 * Bulk Edit (Pro) — filter + action descriptors.
 *
 * Bulk edit selects by *predicate*, not by a list of ids: the client sends a
 * filter and the server resolves it. So everything here crosses a trust
 * boundary — server actions are directly callable — and both descriptors are
 * normalized/validated server-side before they reach the database.
 *
 * The matching SQL lives in `bulk_edit_match` / `bulk_edit_apply`; the shapes
 * below are the contract with those functions.
 */

/** Sentinel rarity for cards with no rarity recorded. Most of the card catalog
 *  has a null rarity, so these have to stay selectable rather than silently
 *  falling outside every rarity filter. Mirrored in `bulk_edit_match`. */
export const RARITY_NONE = "__none__";

export interface BulkFilter {
  /** Card set names (cards.set_name — NOT NULL, unlike set_code). */
  sets?: string[];
  /** Rarity keys, or RARITY_NONE. */
  rarities?: string[];
  /** collection_items.condition values. */
  conditions?: string[];
  /** Tracked market-value band. A card with no market value matches neither bound. */
  minValue?: number | null;
  maxValue?: number | null;
  /** Current listing state. null/undefined = don't care. */
  forSale?: boolean | null;
  forTrade?: boolean | null;
  /** true = slabbed only, false = raw only, null/undefined = both. */
  graded?: boolean | null;
}

export type RoundMode = "cent" | "quarter" | "half" | "whole" | "ninety_nine";

export const ROUND_MODES: { value: RoundMode; label: string }[] = [
  { value: "cent",        label: "Exact cent" },
  { value: "quarter",     label: "Nearest $0.25" },
  { value: "half",        label: "Nearest $0.50" },
  { value: "whole",       label: "Nearest dollar" },
  { value: "ninety_nine", label: "Nearest .99" },
];

export type BulkActionType =
  | "price_market_pct"
  | "price_list_pct"
  | "clear_list_price"
  | "set_for_sale"
  | "set_for_trade";

export interface PriceAction {
  type: "price_market_pct" | "price_list_pct";
  /** Percent adjustment. -5 = five percent below the anchor. */
  pct: number;
  /** Hard minimum price. Applied *after* rounding, so it always survives. */
  floor: number | null;
  round: RoundMode;
}

export type BulkAction =
  | PriceAction
  | { type: "clear_list_price" }
  | { type: "set_for_sale";  value: boolean }
  | { type: "set_for_trade"; value: boolean };

export interface BulkPreview {
  /** Items matching the filter that aren't locked. */
  matched: number;
  /** Matching items skipped because they're on hold or mid-transfer. */
  locked: number;
  /** Items the action will actually change. */
  applicable: number;
  /** Matched but missing the value this action anchors to. */
  skippedNoValue: number;
  /** Sum of list_price across `applicable` items, before and after. */
  currentValue: number;
  projectedValue: number;
}

// ── Validation ──────────────────────────────────────────────────────────────
//
// Bounds are deliberately generous but finite. The point isn't to second-guess
// the user's pricing, it's to make a malformed or hostile payload fail loudly
// here rather than write nonsense across an entire collection.

const MAX_LIST_ENTRIES = 500;
const MAX_ENTRY_LENGTH = 200;
/** Below -99% every price collapses to the floor, which is never intentional. */
const MIN_PCT = -99;
const MAX_PCT = 1000;
const MAX_MONEY = 1_000_000;

export class BulkValidationError extends Error {}

function fail(message: string): never {
  throw new BulkValidationError(message);
}

function normalizeStringList(raw: unknown, field: string): string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) fail(`${field} must be a list`);
  const out = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (out.length !== raw.length) fail(`${field} contains a non-string entry`);
  if (out.length > MAX_LIST_ENTRIES) fail(`${field} has too many entries`);
  if (out.some((v) => v.length > MAX_ENTRY_LENGTH)) fail(`${field} contains an over-long entry`);
  return out.length > 0 ? [...new Set(out)] : undefined;
}

function normalizeMoney(raw: unknown, field: string): number | null | undefined {
  if (raw == null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) fail(`${field} must be a number`);
  if (n < 0) fail(`${field} cannot be negative`);
  if (n > MAX_MONEY) fail(`${field} is out of range`);
  return n;
}

function normalizeTriState(raw: unknown, field: string): boolean | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "boolean") fail(`${field} must be true, false, or unset`);
  return raw;
}

/**
 * Validate and normalize an untrusted filter. Absent/empty axes are dropped
 * entirely rather than sent as empty arrays, so the SQL's "no constraint on
 * this axis" branch is what runs.
 */
export function normalizeFilter(raw: unknown): BulkFilter {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) fail("Filter must be an object");
  const r = raw as Record<string, unknown>;

  const min = normalizeMoney(r.minValue, "minValue");
  const max = normalizeMoney(r.maxValue, "maxValue");
  if (min != null && max != null && min > max) fail("minValue cannot exceed maxValue");

  const filter: BulkFilter = {};
  const sets       = normalizeStringList(r.sets, "sets");
  const rarities   = normalizeStringList(r.rarities, "rarities");
  const conditions = normalizeStringList(r.conditions, "conditions");
  const forSale    = normalizeTriState(r.forSale, "forSale");
  const forTrade   = normalizeTriState(r.forTrade, "forTrade");
  const graded     = normalizeTriState(r.graded, "graded");

  if (sets)       filter.sets = sets;
  if (rarities)   filter.rarities = rarities;
  if (conditions) filter.conditions = conditions;
  if (min != null) filter.minValue = min;
  if (max != null) filter.maxValue = max;
  if (forSale  !== undefined) filter.forSale  = forSale;
  if (forTrade !== undefined) filter.forTrade = forTrade;
  if (graded   !== undefined) filter.graded   = graded;

  return filter;
}

/** Validate and normalize an untrusted action descriptor. */
export function normalizeAction(raw: unknown): BulkAction {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) fail("Action must be an object");
  const r = raw as Record<string, unknown>;
  const type = r.type;

  switch (type) {
    case "price_market_pct":
    case "price_list_pct": {
      const pct = typeof r.pct === "number" ? r.pct : Number(r.pct);
      if (!Number.isFinite(pct)) fail("pct must be a number");
      if (pct < MIN_PCT || pct > MAX_PCT) fail(`pct must be between ${MIN_PCT} and ${MAX_PCT}`);

      const floor = normalizeMoney(r.floor, "floor");
      const round = r.round == null ? "cent" : r.round;
      if (!ROUND_MODES.some((m) => m.value === round)) fail("Unknown rounding mode");

      return {
        type,
        pct: Math.round(pct * 100) / 100,
        floor: floor ?? null,
        round: round as RoundMode,
      };
    }
    case "clear_list_price":
      return { type: "clear_list_price" };
    case "set_for_sale":
    case "set_for_trade": {
      if (typeof r.value !== "boolean") fail("value must be a boolean");
      return { type, value: r.value };
    }
    default:
      fail(`Unknown bulk action: ${String(type)}`);
  }
}

/** Human-readable summary, used in confirmations and the undo toast. */
export function describeAction(action: BulkAction): string {
  switch (action.type) {
    case "price_market_pct":
      return `Set price to market ${action.pct >= 0 ? "+" : ""}${action.pct}%`;
    case "price_list_pct":
      return `Adjust current price by ${action.pct >= 0 ? "+" : ""}${action.pct}%`;
    case "clear_list_price":
      return "Clear listing price";
    case "set_for_sale":
      return action.value ? "List for sale" : "Unlist from sale";
    case "set_for_trade":
      return action.value ? "Mark for trade" : "Unmark for trade";
  }
}

/** Whether a filter constrains anything at all. An unconstrained bulk edit is
 *  legitimate ("reprice everything") but the UI warns before applying it. */
export function isFilterEmpty(filter: BulkFilter): boolean {
  return Object.keys(filter).length === 0;
}
