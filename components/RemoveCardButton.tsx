"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function RemoveCardButton({ itemId }: { itemId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);
  const router                      = useRouter();

  async function handleRemove() {
    setLoading(true);
    const supabase = createClient();
    await supabase.from("collection_items").delete().eq("id", itemId);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRemove}
          disabled={loading}
          className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          {loading ? "Removing…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-muted hover:border-red-500/40 hover:text-red-400 transition-colors"
    >
      Remove
    </button>
  );
}
