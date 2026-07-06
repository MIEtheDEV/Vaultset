import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Logs one card-add telemetry event (how a card was added, whether the top scan
// result was accepted, which identity fields were corrected, optional feedback).
// Any authenticated user; written with the admin client (RLS is service-role only).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    source?: string;
    index?: number | null;
    acceptedFirst?: boolean | null;
    modifiedFields?: string[];
    feedback?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const source = body.source === "scan" || body.source === "search" ? body.source : "manual";

  try {
    const admin = createAdminClient();
    await admin.from("card_add_events").insert({
      user_id: user.id,
      source,
      scan_candidate_index: typeof body.index === "number" ? body.index : null,
      accepted_first: typeof body.acceptedFirst === "boolean" ? body.acceptedFirst : null,
      modified_fields: Array.isArray(body.modifiedFields)
        ? body.modifiedFields.filter((f): f is string => typeof f === "string")
        : null,
      feedback: typeof body.feedback === "string" && body.feedback.trim() ? body.feedback.trim().slice(0, 2000) : null,
    });
  } catch {
    /* telemetry is best-effort */
  }

  return NextResponse.json({ ok: true });
}
