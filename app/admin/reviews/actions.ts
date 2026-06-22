"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/admin";

export async function approveReview(reviewId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from("reviews").update({ approved: true }).eq("id", reviewId);
  revalidatePath("/admin/reviews");
  revalidatePath("/");
}

export async function rejectReview(reviewId: string) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from("reviews").delete().eq("id", reviewId);
  revalidatePath("/admin/reviews");
  revalidatePath("/");
}

export async function togglePin(reviewId: string, pinned: boolean) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from("reviews").update({ pinned: !pinned }).eq("id", reviewId);
  revalidatePath("/admin/reviews");
  revalidatePath("/");
}
