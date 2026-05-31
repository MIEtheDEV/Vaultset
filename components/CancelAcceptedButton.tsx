"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelAcceptedOffer } from "@/app/offers/actions";

export function CancelAcceptedButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  function handleConfirm() {
    setError("");
    startTransition(async () => {
      try {
        await cancelAcceptedOffer(offerId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setShowConfirm(false);
      }
    });
  }

  if (showConfirm) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
        <p className="text-xs text-red-400">
          This will cancel the deal and release all held items for both parties. The other party will be notified.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
            className="flex-1 rounded-full border border-border py-2 text-sm text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            Keep Deal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-1 rounded-full border border-red-500/40 bg-red-500/10 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {isPending ? "Cancelling…" : "Confirm Cancel"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      className="w-full rounded-full border border-border py-2.5 text-sm text-foreground-muted hover:text-foreground hover:border-red-500/40 transition-colors"
    >
      Cancel Deal
    </button>
  );
}
