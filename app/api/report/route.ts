import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isUserAdmin } from "@/lib/auth/admin";

const VALID_REASONS = new Set([
  "Inappropriate profile content",
  "Harassment or threatening behaviour",
  "Spam or scam",
  "Impersonation",
  "Other",
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportedUserId, reason } = await req.json();

  if (!reportedUserId || typeof reportedUserId !== "string")
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (!VALID_REASONS.has(reason))
    return NextResponse.json({ error: "Invalid reason." }, { status: 400 });

  if (reportedUserId === user.id)
    return NextResponse.json({ error: "You cannot report yourself." }, { status: 400 });

  const admin = createAdminClient();
  const isAdmin = await isUserAdmin(user.id);

  if (!isAdmin) {
    // Rate-limit: one report per reporter/target pair per day
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("reporter_id", user.id)
      .eq("reported_user_id", reportedUserId)
      .gte("created_at", since);

    if ((count ?? 0) > 0)
      return NextResponse.json({ error: "You have already reported this user recently." }, { status: 429 });
  }

  const { error } = await admin.from("reports").insert({
    reporter_id:      user.id,
    reported_user_id: reportedUserId,
    reason,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
