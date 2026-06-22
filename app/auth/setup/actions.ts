"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { likeEscape } from "@/lib/username";

/**
 * Completes profile setup for a freshly-authenticated user (typically OAuth,
 * who has no profile row yet because the handle_new_user trigger only sees a
 * username for email signups).
 *
 * Runs server-side and writes through the service-role admin client because
 * `profiles` has no INSERT RLS policy — a client-side insert/upsert fails with
 * "new row violates row-level security policy". A plain client UPDATE silently
 * matches zero rows when the profile doesn't exist, which is the bug this
 * replaces (OAuth users ended up with no profile → @unknown, missing from the
 * community). Using upsert here covers both the missing-row and existing-row
 * cases.
 *
 * Returns { ok: true } or { error } — never throws.
 */
export async function completeProfileSetup(
  rawUsername: string
): Promise<{ ok: true } | { error: string }> {
  const username = rawUsername.trim().toLowerCase();

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return { error: "Usernames must be 3–30 characters: letters, numbers, and underscores only." };
  }

  // Authenticate via the user's session (cookie-backed, verified server-side).
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Your session has expired. Please sign in again." };

  const admin = createAdminClient();

  // Reject if the username is taken by someone else.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", likeEscape(username))
    .maybeSingle();

  if (existing && existing.id !== user.id) {
    return { error: "This username is already taken." };
  }

  // Create the profile row if missing, or update the username if it exists.
  const { error: upsertError } = await admin
    .from("profiles")
    .upsert({ id: user.id, username }, { onConflict: "id" });

  if (upsertError) {
    // Most likely a unique-violation race on the username.
    if (upsertError.code === "23505") return { error: "This username is already taken." };
    console.error("[completeProfileSetup] upsert error:", upsertError.code, upsertError.message);
    return { error: "Could not save your username. Please try again." };
  }

  // Mirror the username into auth metadata so the callback's hasUsername guard
  // stops redirecting this user back to setup.
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, username, full_name: user.user_metadata?.full_name ?? username },
  });
  if (metaError) {
    console.error("[completeProfileSetup] metadata update error:", metaError.message);
    // Non-fatal: the profile row exists, which is what matters for display.
  }

  return { ok: true };
}
