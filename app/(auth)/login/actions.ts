"use server";

import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Resolves a login identifier (email or username) to the account email.
 * Returns { email } on success or { error } on failure — never throws —
 * so user-facing messages survive Next.js's production error sanitisation.
 *
 * Requires docs/username-login-migration.sql to be run first.
 */
export async function resolveLoginEmail(
  identifier: string
): Promise<{ email: string } | { error: string }> {
  if (identifier.includes("@")) return { email: identifier };

  try {
    const admin = createAdminClient();

    const { data: email, error } = await admin.rpc("get_email_for_username", {
      p_username: identifier.trim(),
    });

    if (error || !email) return { error: "No account found with that username." };

    return { email: email as string };
  } catch (err) {
    console.error("[resolveLoginEmail]", err);
    return { error: "No account found with that username." };
  }
}
