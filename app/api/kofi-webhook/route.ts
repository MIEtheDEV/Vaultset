import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

/** Constant-time string compare; false on any length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Look up an auth user by email, paging through all users. The admin API has no
 * get-by-email, and a single listUsers page silently caps at ~1000 — so donors
 * beyond the first page would never receive the Supporter flag.
 */
async function findUserByEmail(admin: SupabaseClient, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null; // reached the last page
  }
  return null;
}

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

  if (typeof payload.verification_token !== "string" || !safeEqual(payload.verification_token, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!email) {
    // Anonymous donation — accept but skip profile update.
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const user = await findUserByEmail(admin, email);

  if (user) {
    await admin.from("profiles").update({ is_supporter: true }).eq("id", user.id);
  }

  return NextResponse.json({ received: true });
}
