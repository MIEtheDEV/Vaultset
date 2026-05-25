import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(request: NextRequest) {
  const secret = process.env.KOFI_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 501 });
  }

  const formData = await request.formData();
  const raw = formData.get("data");
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (payload.verification_token !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!email) {
    // Anonymous donation — accept but skip profile update.
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = usersData?.users.find((u) => u.email?.toLowerCase() === email);

  if (user) {
    await admin.from("profiles").update({ is_supporter: true }).eq("id", user.id);
  }

  return NextResponse.json({ received: true });
}
