import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Insert a `test_push` notification for the current user to exercise the full
 * delivery chain end-to-end: insert → push_dispatch_after_insert trigger →
 * pg_net → /api/push/dispatch → web push. Returns the user's subscribed-device
 * count so the UI can give immediate feedback (the push itself is async).
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const admin = createAdminClient();

  const { count } = await admin
    .from("push_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (!count) return NextResponse.json({ subscriptions: 0 });

  // Inserting fires the dispatch trigger; notifications are insert-restricted by
  // RLS, so use the service-role client.
  const { error } = await admin.from("notifications").insert({
    user_id:  user.id,
    type:     "test_push",
    actor_id: null,
    data:     { sent_at: new Date().toISOString() },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: count, queued: true });
}
