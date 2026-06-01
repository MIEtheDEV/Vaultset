"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

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
