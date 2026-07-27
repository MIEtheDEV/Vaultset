"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/admin";

// /reviews is statically prerendered, so it needs an explicit bust — without it,
// approvals and deletions never reached the page until the next deploy. It now
// also reflects unapproved submissions in its headline count, so every mutation
// has to invalidate it.
function revalidateReviewSurfaces() {
  revalidatePath("/admin/reviews");
  revalidatePath("/");
  revalidatePath("/reviews");
}

export async function approveReview(reviewId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from("reviews").update({ approved: true }).eq("id", reviewId);
  revalidateReviewSurfaces();
}

export async function rejectReview(reviewId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from("reviews").delete().eq("id", reviewId);
  revalidateReviewSurfaces();
}

/**
 * Clears a moderation hold — the review returns to the public list and starts
 * counting toward the aggregate rating. Use for false positives; use rejectReview
 * for genuine abuse, since a hidden row still has to be deleted to leave the rating
 * alone permanently.
 */
export async function publishHeldReview(reviewId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin
    .from("reviews")
    .update({ hidden: false, moderation_flags: [] })
    .eq("id", reviewId);
  revalidateReviewSurfaces();
}

export async function togglePin(reviewId: string, pinned: boolean) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from("reviews").update({ pinned: !pinned }).eq("id", reviewId);
  revalidateReviewSurfaces();
}
