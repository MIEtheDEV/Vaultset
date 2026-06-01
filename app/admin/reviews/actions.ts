"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (user.user_metadata?.username !== process.env.ADMIN_USERNAME) throw new Error("Forbidden");
}

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
