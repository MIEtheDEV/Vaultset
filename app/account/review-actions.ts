"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

export async function submitReview(params: {
  rating: number;
  body: string;
  displayName: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  const { error } = await admin.from("reviews").upsert(
    {
      user_id:      user.id,
      rating:       params.rating,
      body:         params.body,
      display_name: params.displayName,
      approved:     false,
      pinned:       false,
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);

  // Notify the admin
  const adminUsername = process.env.ADMIN_USERNAME;
  if (adminUsername) {
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", adminUsername)
      .maybeSingle();

    if (adminProfile) {
      const { data: reviewer } = await admin
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      await admin.from("notifications").insert({
        user_id:  adminProfile.id,
        actor_id: user.id,
        type:     "new_review",
        data:     { reviewer_username: reviewer?.username ?? "unknown" },
      });
    }
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/");
}
