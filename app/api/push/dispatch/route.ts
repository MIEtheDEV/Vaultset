import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { buildPushPayload, prefKeyForType } from "@/lib/notificationPush";

/**
 * Internal endpoint hit by the `push_dispatch_after_insert` DB trigger (via
 * pg_net) for every row inserted into `notifications`. Verifies the shared
 * secret, applies the recipient's per-type push preferences, and fans the push
 * out to their devices. Never trusted from the public internet — the secret is
 * the gate, so an attacker can't push arbitrary payloads to arbitrary users.
 */
export async function POST(req: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || req.headers.get("x-push-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    user_id?: string;
    type?: string;
    actor_id?: string | null;
    data?: Record<string, unknown> | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { user_id, type, actor_id, data } = body;
  if (!user_id || !type) {
    return NextResponse.json({ error: "Missing user_id or type" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Preference gate. Missing row = all on (opt-out model); unmapped types are
  // always delivered (prefKeyForType returns null).
  const prefKey = prefKeyForType(type);
  if (prefKey) {
    const { data: prefs } = await admin
      .from("notification_preferences")
      .select(prefKey)
      .eq("user_id", user_id)
      .maybeSingle();
    if (prefs && (prefs as Record<string, boolean>)[prefKey] === false) {
      return NextResponse.json({ skipped: "muted" });
    }
  }

  // Per-conversation mute gate (chat only). The global push_messages switch
  // above is the master; this narrows it to specific conversations the user
  // silenced. Presence of a conversation_mutes row = muted.
  if (type === "new_message") {
    const conversationId = typeof data?.conversation_id === "string" ? data.conversation_id : null;
    if (conversationId) {
      const { data: mute } = await admin
        .from("conversation_mutes")
        .select("conversation_id")
        .eq("user_id", user_id)
        .eq("conversation_id", conversationId)
        .maybeSingle();
      if (mute) return NextResponse.json({ skipped: "conversation_muted" });
    }
  }

  // Resolve the actor's username for payload copy when present.
  let actorUsername: string | null = null;
  if (actor_id) {
    const { data: actor } = await admin
      .from("profiles")
      .select("username")
      .eq("id", actor_id)
      .maybeSingle();
    actorUsername = (actor as { username?: string } | null)?.username ?? null;
  }

  const payload = buildPushPayload({ type, data }, actorUsername);
  const sent = await sendPushToUser(user_id, payload);

  return NextResponse.json({ sent });
}
