"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CollectionDeleter({
  collectionId,
  redirectTo,
}: {
  collectionId: string;
  redirectTo: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/collections/${collectionId}`, { method: "DELETE" });
    if (res.ok) {
      router.push(redirectTo);
      router.refresh();
    } else {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-border px-3 py-2 text-sm text-foreground-muted hover:border-red-500/40 hover:text-red-400 transition-colors"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-foreground-muted">Delete this collection?</span>
      <button
        onClick={handleDelete}
        disabled={loading}
        className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
      >
        {loading ? "Deleting…" : "Confirm"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={loading}
        className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors disabled:opacity-40"
      >
        Cancel
      </button>
    </div>
  );
}
