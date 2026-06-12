import { createClient } from "@/utils/supabase/server";

export async function isPro(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_pro, pro_auto_renews, pro_expires_at")
    .eq("id", userId)
    .single();

  if (!data || !(data as any).is_pro) return false;

  const expiresAt = (data as any).pro_expires_at as string | null;
  const autoRenews = (data as any).pro_auto_renews as boolean;

  // For non-renewing plans (one-time, cancelled), enforce expiry at read time
  if (!autoRenews && expiresAt && new Date(expiresAt) < new Date()) return false;

  return true;
}
