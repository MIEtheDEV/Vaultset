"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function CollectionEntryRemover({
  entryId,
  collectionId,
}: {
  entryId: string;
  collectionId: string;
}) {
  const [removing, setRemoving] = useState(false);
  const router = useRouter();

  async function remove() {
    setRemoving(true);
    const supabase = createClient();
    await supabase.from("collection_entries").delete().eq("id", entryId);
    router.refresh();
  }

  return (
    <button
      onClick={remove}
      disabled={removing}
      title="Remove from collection"
      className="w-full rounded-lg border border-border py-1 text-xs text-foreground-muted hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40"
    >
      {removing ? "…" : "Remove"}
    </button>
  );
}
