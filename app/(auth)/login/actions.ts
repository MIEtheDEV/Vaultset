"use server";

import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Resolves a login identifier (email or username) to the account email.
 * Username lookup uses a case-insensitive DB function to avoid the
 * Auth Management API (auth.admin.getUserById), which is unreliable in
 * some production environments.
 *
 * Requires docs/username-login-migration.sql to be run first.
 */
export async function resolveLoginEmail(identifier: string): Promise<string> {
  if (identifier.includes("@")) return identifier;

  const admin = createAdminClient();

  const { data: email, error } = await admin.rpc("get_email_for_username", {
    p_username: identifier.trim(),
  });

  if (error || !email) throw new Error("No account found with that username.");

  return email as string;
}
