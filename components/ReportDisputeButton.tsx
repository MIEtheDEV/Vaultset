"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportDispute } from "@/app/offers/actions";

export function ReportDisputeButton({
  offerId,
  cardName,
  otherUsername,
}: {
  offerId: string;
  cardName: string;
  otherUsername: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!description.trim()) { setError("Please describe the issue."); return; }
    setError("");
    startTransition(async () => {
      try {
        const convId = await reportDispute({ offerId, cardName, otherUsername, description: description.trim() });
        router.push(`/messages/${convId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-foreground-muted hover:text-red-400 transition-colors"
      >
        Report a problem
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
      <p className="text-sm font-medium text-foreground">Report a Problem</p>
      <p className="text-xs text-foreground-muted">
        Describe the issue and your message will be sent to support.
      </p>
      <textarea
        rows={3}
        maxLength={1000}
        placeholder="e.g. Card arrived damaged, seller is unresponsive…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-red-500/40 focus:outline-none transition-colors"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setDescription(""); setError(""); }}
          disabled={isPending}
          className="flex-1 rounded-full border border-border py-2 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !description.trim()}
          className="flex-1 rounded-full bg-red-500/10 border border-red-500/30 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send to Support"}
        </button>
      </div>
    </div>
  );
}
