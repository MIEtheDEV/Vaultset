"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Resolves a login identifier (email or username) to the account email.
 * Returns { email } on success or { error } on failure — never throws —
 * so user-facing messages survive Next.js's production error sanitisation.
 *
 * Uses the anon-key server client; the DB function is SECURITY DEFINER
 * so it accesses auth.users internally without needing the service role key.
 *
 * Requires docs/username-login-migration.sql to be run first.
 */
export async function resolveLoginEmail(
  identifier: string
): Promise<{ email: string } | { error: string }> {
  if (identifier.includes("@")) return { email: identifier };

  try {
    const supabase = await createClient();

    const { data: email, error: rpcError } = await supabase.rpc("get_email_for_username", {
      p_username: identifier.trim(),
    });

    if (rpcError) {
      console.error("[resolveLoginEmail] rpc error:", rpcError.code, rpcError.message);
      return { error: "Login failed. Please try again." };
    }

    // Return the same generic message Supabase emits for a wrong password, so
    // this resolver can't be used as an oracle to enumerate which usernames
    // exist. (Per-IP rate limiting should also be applied at the edge/WAF.)
    if (!email) return { error: "Invalid login credentials" };

    return { email: email as string };
  } catch (err) {
    console.error("[resolveLoginEmail] exception:", err);
    return { error: "Login failed. Please try again." };
  }
}
