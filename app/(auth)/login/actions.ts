"use server";

import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Resolves a login identifier (email or username) to the account email.
 * Username lookup uses a case-insensitive match.
 */
export async function resolveLoginEmail(identifier: string): Promise<string> {
  if (identifier.includes("@")) return identifier;

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", identifier)
    .maybeSingle();

  if (!profile) throw new Error("No account found with that username.");

  const { data: { user }, error } = await admin.auth.admin.getUserById(profile.id as string);
  if (error || !user?.email) throw new Error("Account not found.");

  return user.email;
}
