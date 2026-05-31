"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markItemReceived } from "@/app/offers/actions";

export function MarkReceivedButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function handleClick() {
    setError("");
    startTransition(async () => {
      try {
        await markItemReceived(offerId);
        setDone(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Added to inventory
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-4 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
      >
        {isPending ? "Processing…" : "Mark as Received"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function WaitingForConfirmation({ otherUsername }: { otherUsername?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
      <p className="text-xs text-foreground-muted">
        You&apos;ve confirmed receipt.{" "}
        {otherUsername
          ? <>Waiting for <span className="text-gold">@{otherUsername}</span> to confirm.</>
          : "Waiting for the other party to confirm."
        }
      </p>
    </div>
  );
}
