import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Sniff the real image type from magic bytes rather than trusting the
 * client-sent Content-Type (which is forgeable). Returns null for anything
 * that isn't a JPEG/PNG/WebP, so arbitrary bytes can't be parked in the
 * public avatars bucket (security-audit.md, Low/Informational).
 */
function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  )
    return "image/png";
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Reject oversized uploads before buffering the whole multipart body.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES + 1024) // small slack for multipart overhead
    return NextResponse.json({ error: "File must be under 2 MB." }, { status: 413 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_TYPES.has(file.type))
    return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, or WebP." }, { status: 400 });

  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "File must be under 2 MB." }, { status: 400 });

  // Verify the bytes actually match an allowed image format — don't trust file.type.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffedType = sniffImageType(bytes);
  if (!sniffedType)
    return NextResponse.json({ error: "File is not a valid JPEG, PNG, or WebP image." }, { status: 400 });

  const ext = sniffedType === "image/webp" ? "webp" : sniffedType === "image/png" ? "png" : "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const admin = createAdminClient();

  const { error: uploadErr } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { upsert: true, contentType: sniffedType });

  if (uploadErr) {
    console.error("[avatar/upload] storage error:", uploadErr.message);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from("avatars").getPublicUrl(path);
  const url = `${publicUrl}?v=${Date.now()}`;

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);

  if (updateErr) {
    console.error("[avatar/upload] profile update error:", updateErr.message);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  return NextResponse.json({ url });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: files } = await admin.storage.from("avatars").list(user.id);
  if (files && files.length > 0) {
    const paths = files.map((f) => `${user.id}/${f.name}`);
    await admin.storage.from("avatars").remove(paths);
  }

  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);

  if (error) {
    console.error("[avatar/delete] profile update error:", error.message);
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
