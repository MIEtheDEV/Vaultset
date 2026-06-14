import webpush from "web-push";
import { createAdminClient } from "@/utils/supabase/admin";

let configured = false;

/** Lazily configure web-push with the VAPID keys. Returns false if unset. */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@vaultset.app",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Relative URL opened when the notification is clicked. */
  url?: string;
  /** Collapses notifications that share a tag (e.g. one per listing). */
  tag?: string;
};

/**
 * Send a web-push notification to every device the user has registered.
 * No-ops cleanly when push isn't configured or the user has no subscriptions.
 * Subscriptions rejected with 404/410 (expired/unsubscribed) are pruned.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  const staleIds: string[] = [];

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      ).catch((err: unknown) => {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) staleIds.push(s.id);
        throw err;
      }),
    ),
  );

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }

  return results.filter((r) => r.status === "fulfilled").length;
}
