import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Record that the current user has installed the app. Idempotent: the timestamp
 * is only set the first time so it reflects the original install date.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: existing } = await supabase
    .from("profiles")
    .select("pwa_installed_at")
    .eq("id", user.id)
    .single();

  if (existing?.pwa_installed_at) {
    return NextResponse.json({ installed: true });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ pwa_installed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ installed: true });
}
