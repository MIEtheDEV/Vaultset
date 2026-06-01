"use client";

import { useTransition } from "react";
import { approveReview, rejectReview, togglePin } from "@/app/admin/reviews/actions";

export function AdminReviewActions({
  reviewId,
  approved,
  pinned,
}: {
  reviewId: string;
  approved: boolean;
  pinned: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!approved && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => approveReview(reviewId))}
          className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          Approve
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => togglePin(reviewId, pinned))}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          pinned
            ? "border-gold/40 bg-gold/10 text-gold hover:bg-gold/20"
            : "border-border text-foreground-muted hover:text-foreground"
        }`}
      >
        {pinned ? "Unpin" : "Pin to homepage"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => rejectReview(reviewId))}
        className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
