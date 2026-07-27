"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { moderateReview } from "@/lib/reviews/moderation";

export async function submitReview(params: {
  rating: number;
  body: string;
  /** Withholds the username from public display. The row still records who wrote it. */
  anonymous: boolean;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  // The attribution name is never client-supplied — it's read from the profile here,
  // and the DB enforces the same invariant via enforce_review_display_name().
  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  const username = profile?.username as string | undefined;
  if (!username) throw new Error("Your profile is missing a username.");

  // Deterministic moderation, in-process: profanity is masked and publishes as
  // normal; hate speech and spam links are held with `hidden` for admin review.
  // Never keyed on the rating — a scathing review passes through untouched.
  const moderation = moderateReview({ body: params.body, username });

  const { error } = await admin.from("reviews").upsert(
    {
      user_id:          user.id,
      rating:           params.rating,
      body:             moderation.body,
      // Always stored, so a review stays attributable internally even when the author
      // chose anonymity; `anonymous` is what controls whether it's rendered.
      display_name:     username,
      anonymous:        params.anonymous || moderation.forceAnonymous,
      approved:         false,
      pinned:           false,
      hidden:           moderation.hidden,
      moderation_flags: moderation.flags,
      body_raw:         moderation.bodyRaw,
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
        data:     {
          reviewer_username: reviewer?.username ?? "unknown",
          // Carried so the notification says whether this one needs attention.
          moderation_flags:  moderation.flags,
          hidden:            moderation.hidden,
        },
      });
    }
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/");
  revalidatePath("/reviews");
}
