import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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

  // endpoint is unique — upsert so re-subscribing the same device is idempotent
  // and re-binds the endpoint to the current user.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
