"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function RemoveWishlistButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    const supabase = createClient();
    await supabase.from("wishlist_items").delete().eq("id", id);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={loading}
      className="w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-50"
    >
      {loading ? "Removing…" : "Remove"}
    </button>
  );
}
