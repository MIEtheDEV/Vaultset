import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Authoritative admin check. Reads `profiles.is_admin` via the service-role
 * client — never `user_metadata`, which is client-writable and therefore not
 * trustworthy for authorization (see docs/security-audit.md, Critical #1).
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin === true;
}

/**
 * Server-side gate for admin server actions and routes: verifies the caller is
 * authenticated (network-verified via getUser) AND flagged admin in the DB.
 * Throws on failure; returns the verified user so callers can attribute audit logs.
 */
export async function assertAdmin(): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!(await isUserAdmin(user.id))) throw new Error("Forbidden");
  return user;
}
