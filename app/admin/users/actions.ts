"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (user.user_metadata?.username !== process.env.ADMIN_USERNAME) throw new Error("Forbidden");
  return user;
}

export async function banUser(userId: string) {
  const adminUser = await assertAdmin();
  const admin = createAdminClient();
  await Promise.all([
    admin.auth.admin.updateUserById(userId, { ban_duration: "87600h" }),
    admin.from("profiles").update({ banned: true }).eq("id", userId),
    admin.from("admin_audit_log").insert({
      admin_id:       adminUser.id,
      target_user_id: userId,
      action:         "ban_user",
    }),
  ]);
  revalidatePath("/admin/users");
}

export async function unbanUser(userId: string) {
  const adminUser = await assertAdmin();
  const admin = createAdminClient();
  await Promise.all([
    admin.auth.admin.updateUserById(userId, { ban_duration: "none" }),
    admin.from("profiles").update({ banned: false }).eq("id", userId),
    admin.from("admin_audit_log").insert({
      admin_id:       adminUser.id,
      target_user_id: userId,
      action:         "unban_user",
    }),
  ]);
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  const adminUser = await assertAdmin();
  const admin = createAdminClient();

  // Fetch target username before deleting (cascade will remove the profile)
  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  await admin.from("admin_audit_log").insert({
    admin_id:       adminUser.id,
    target_user_id: userId,
    action:         "delete_user",
    metadata:       { username: profile?.username ?? null },
  });

  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/admin/users");
}
