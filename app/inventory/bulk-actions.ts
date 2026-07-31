"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isPro } from "@/lib/isPro";
import { revalidatePath } from "next/cache";
import { PriceFetchEngine } from "@/lib/pricing/PriceFetchEngine";
import { propagateMarketValues } from "@/lib/pricing/propagateMarketValues";
import { ensureGradedPrices } from "@/lib/pricing/gradedPrices";
import { priceApiId } from "@/lib/pricing/cardIdentity";
import type { CardRef } from "@/lib/pricing/PriceProvider";
import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import {
  normalizeFilter,
  normalizeAction,
  describeAction,
  type BulkPreview,
} from "@/lib/bulk/types";

export async function bulkSetForSale(itemIds: string[], value: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("collection_items")
    .update({ for_sale: value })
    .in("id", itemIds)
    .eq("user_id", user.id)
    .eq("on_hold", false);

  revalidatePath("/inventory");
}

export async function bulkSetForTrade(itemIds: string[], value: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("collection_items")
    .update({ for_trade: value })
    .in("id", itemIds)
    .eq("user_id", user.id)
    .eq("on_hold", false);

  revalidatePath("/inventory");
}

/**
 * Refresh a single inventory item's tracked market value (market_price) through
 * the cascading pricing engine, then persist it. Does NOT touch list_price —
 * market value and listing price are kept separate. Returns the new value.
 */
export async function refreshItemMarketValue(itemId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // On-demand refresh is a Pro feature — enforced here, not just in the UI,
  // since server actions are directly callable and this spends the price-API budget.
  if (!(await isPro(user.id))) throw new Error("On-demand refresh is a Pro feature.");

  const { data: item } = await supabase
    .from("collection_items")
    .select("id, finish, condition, grader, grade, cards ( id, name, set_name, set_code, card_number, game_data )")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .single();
  if (!item) throw new Error("Item not found");

  const card  = Array.isArray(item.cards) ? item.cards[0] : item.cards;
  const gd    = ((card as any)?.game_data ?? {}) as Record<string, unknown>;
  const apiId = priceApiId(gd, (card as any)?.id);
  if (!apiId) return null;

  const ref: CardRef = {
    apiId,
    tcgplayerId: (gd.tcgplayer_id as string) ?? null,
    name:    (card as any)?.name        ?? undefined,
    setName: (card as any)?.set_name    ?? undefined,
    setCode: (card as any)?.set_code    ?? undefined,
    number:  (card as any)?.card_number ?? undefined,
  };

  const admin    = createAdminClient();
  const engine   = new PriceFetchEngine(admin);
  const priced   = await engine.getPrices([ref], { allowResolve: true });
  const resolved = priced.get(apiId);
  if (!resolved) return null;

  const isGraded = !!(item as any).grader && (item as any).grade != null;
  const gradedPrices = isGraded ? await ensureGradedPrices(admin, apiId) : null;

  const provider = new PokemonTCGProvider();
  const price = provider.getMarketPrice(
    { prices: resolved.prices } as TcgPlayerData,
    (item as any).finish ?? null,
    (gd.edition as string) ?? null,
    (item as any).condition ?? null,
    (item as any).grader ?? null,
    (item as any).grade ?? null,
    resolved.conditionPrices,
    gradedPrices,
  );
  if (price == null) return null;

  await supabase
    .from("collection_items")
    .update({ market_price: price })
    .eq("id", itemId)
    .eq("user_id", user.id);

  // If this was a fresh fetch, propagate the new value to all other holders.
  if (!resolved.fromCache) await propagateMarketValues(admin, [apiId]);

  revalidatePath("/inventory");
  return price;
}

/**
 * Set the listing price equal to the tracked market value for every item the
 * user currently has FOR SALE (skipping on-hold and items without a market
 * value). The per-card "List at Market" button stays the individual path; this
 * is the bulk equivalent. Returns how many listings were updated.
 */
export async function bulkMatchMarket(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: rows } = await supabase
    .from("collection_items")
    .select("id, market_price")
    .eq("user_id", user.id)
    .eq("for_sale", true)
    .eq("on_hold", false)
    .not("market_price", "is", null);

  const updates = rows ?? [];
  await Promise.all(
    updates.map((r) =>
      supabase
        .from("collection_items")
        .update({ list_price: r.market_price })
        .eq("id", r.id)
        .eq("user_id", user.id),
    ),
  );

  revalidatePath("/inventory");
  return updates.length;
}

// ── Bulk Edit (Pro) ─────────────────────────────────────────────────────────
//
// Filter-driven bulk updates. Unlike the checkbox actions above, these select
// by predicate rather than by id list: the client sends a filter descriptor and
// the database resolves it. That keeps "apply to everything matching" true past
// whatever the client happens to have rendered, and makes the set unspoofable.
//
// Matching, price arithmetic, the pre-edit snapshot, and the update all happen
// inside one transaction (`bulk_edit_apply`) so the previewed count and the
// applied count can't drift, and undo can't miss a row it should have captured.

/**
 * Dry run — what would this filter + action actually do? Deliberately NOT
 * Pro-gated: free users can build a filter and see the impact, and the paywall
 * sits on apply. Feeling the value is the whole pitch.
 */
export async function previewBulkEdit(rawFilter: unknown, rawAction: unknown): Promise<BulkPreview> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const filter = normalizeFilter(rawFilter);
  const action = normalizeAction(rawAction);

  const { data, error } = await supabase.rpc("bulk_edit_preview", {
    p_filter: filter,
    p_action: action,
  });
  if (error) throw new Error(error.message);

  const p = (data ?? {}) as Record<string, unknown>;
  return {
    matched:        Number(p.matched        ?? 0),
    locked:         Number(p.locked         ?? 0),
    applicable:     Number(p.applicable     ?? 0),
    skippedNoValue: Number(p.skippedNoValue ?? 0),
    currentValue:   Number(p.currentValue   ?? 0),
    projectedValue: Number(p.projectedValue ?? 0),
  };
}

/**
 * Apply a bulk edit. Pro-gated here rather than only in the UI — server actions
 * are directly callable, so a UI-only gate is no gate at all (same reasoning as
 * refreshItemMarketValue).
 *
 * Returns the batch id, which the caller holds onto to offer undo.
 */
export async function applyBulkEdit(
  rawFilter: unknown,
  rawAction: unknown,
): Promise<{ batchId: string | null; updated: number; description: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!(await isPro(user.id))) throw new Error("Bulk edit is a Pro feature.");

  const filter = normalizeFilter(rawFilter);
  const action = normalizeAction(rawAction);

  const { data, error } = await supabase.rpc("bulk_edit_apply", {
    p_filter: filter,
    p_action: action,
  });
  if (error) throw new Error(error.message);

  const result = (data ?? {}) as Record<string, unknown>;

  revalidatePath("/inventory");
  return {
    batchId:     (result.batchId as string | null) ?? null,
    updated:     Number(result.updated ?? 0),
    description: describeAction(action),
  };
}

/**
 * Revert a bulk edit, restoring every row it touched to its captured pre-edit
 * state. Rows that became locked since the edit (pulled into an offer) are left
 * alone rather than silently reverted.
 */
export async function undoBulkEdit(batchId: string): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!(await isPro(user.id))) throw new Error("Bulk edit is a Pro feature.");

  const { data, error } = await supabase.rpc("bulk_edit_undo", { p_batch_id: batchId });
  if (error) throw new Error(error.message);

  revalidatePath("/inventory");
  return Number((data as Record<string, unknown>)?.restored ?? 0);
}

export async function bulkDelete(itemIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("collection_items")
    .delete()
    .in("id", itemIds)
    .eq("user_id", user.id)
    .eq("on_hold", false)
    .is("transfer_status", null);

  revalidatePath("/inventory");
}
