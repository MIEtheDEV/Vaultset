"use server";

import { createClient } from "@/utils/supabase/server";

export async function getOrCreateConversation(
  recipientId: string,
  listingId?: string | null
): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (user.id === recipientId) throw new Error("Cannot message yourself");

  // Always store participant_1 < participant_2 so there's only one row per pair
  const [p1, p2] = [user.id, recipientId].sort() as [string, string];

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("participant_1", p1)
    .eq("participant_2", p2)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ participant_1: p1, participant_2: p2, listing_id: listingId ?? null })
    .select("id")
    .single();

  if (error || !created) throw new Error("Failed to create conversation");
  return created.id;
}
