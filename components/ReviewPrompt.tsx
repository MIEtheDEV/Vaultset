"use client";

import { useState } from "react";
import { ReviewModal } from "@/components/ReviewModal";

export function ReviewPrompt({ username }: { username: string }) {
  const [open,      setOpen]      = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (dismissed) return null;

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 flex items-center justify-between gap-4">
        <p className="text-sm text-emerald-400 font-medium">
          Thanks for your review! It&apos;ll appear on the homepage once approved.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-foreground-muted hover:text-foreground transition-colors shrink-0"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-gold/20 bg-gold/5 px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Enjoying Vaultset?</p>
          <p className="text-xs text-foreground-muted mt-0.5">
            Leave a quick review and help other collectors find us.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-background hover:bg-gold-light transition-colors"
          >
            Leave a Review
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>

      {open && (
        <ReviewModal
          username={username}
          onClose={() => setOpen(false)}
          onSubmitted={() => { setOpen(false); setSubmitted(true); }}
        />
      )}
    </>
  );
}
