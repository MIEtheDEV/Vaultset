import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: collection } = await supabase
    .from("collections")
    .select("user_id")
    .eq("id", id)
    .single();

  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (collection.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await supabase.from("collections").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
