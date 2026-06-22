import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Known browser push services. The stored endpoint later becomes an outbound
// fetch target during dispatch, so restrict it to real push hosts (SSRF guard)
// rather than persisting any URL a client supplies.
const ALLOWED_PUSH_HOSTS = [
  ".push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com", // also covers autopush subdomains below
  ".notify.windows.com",
  ".push.services.mozilla.com",
];

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_PUSH_HOSTS.some((h) =>
      h.startsWith(".") ? host.endsWith(h) : host === h,
    );
  } catch {
    return false;
  }
}

/** Store (or refresh) a browser push subscription for the current user. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const endpoint = sub?.endpoint;
  const p256dh   = sub?.keys?.p256dh;
  const auth     = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Malformed subscription." }, { status: 400 });
  }
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "Unrecognized push endpoint." }, { status: 400 });
  }

  // endpoint is unique — upsert so re-subscribing the same device is idempotent
  // and re-binds the endpoint to the current user.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (error) {
    console.error("[push/subscribe] upsert error:", error.message);
    return NextResponse.json({ error: "Could not save subscription." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
