"use server";

import { createClient } from "@/utils/supabase/server";

export async function followUser(followingId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (user.id === followingId) throw new Error("Cannot follow yourself");

  await supabase.from("follows").insert({ follower_id: user.id, following_id: followingId });
}

export async function unfollowUser(followingId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase.from("follows").delete()
    .eq("follower_id", user.id)
    .eq("following_id", followingId);
}
