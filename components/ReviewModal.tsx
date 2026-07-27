"use client";

import { useState, useTransition } from "react";
import { submitReview } from "@/app/account/review-actions";

const MAX_CHARS = 140;

export function ReviewModal({
  username,
  onClose,
  onSubmitted,
  initialRating = 0,
  initialBody = "",
  initialAnonymous = false,
}: {
  username: string;
  onClose: () => void;
  onSubmitted: () => void;
  initialRating?: number;
  initialBody?: string;
  initialAnonymous?: boolean;
}) {
  const [rating,     setRating]      = useState(initialRating);
  const [hovered,    setHovered]     = useState(0);
  const [body,       setBody]        = useState(initialBody);
  const [anonymous,  setAnonymous]   = useState(initialAnonymous);
  const [error,      setError]       = useState("");
  const [isPending,  startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) { setError("Please select a star rating."); return; }
    if (!body.trim())  { setError("Please write a short review."); return; }

    setError("");
    startTransition(async () => {
      try {
        await submitReview({
          rating,
          body: body.trim(),
          anonymous,
        });
        onSubmitted();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const charsLeft = MAX_CHARS - body.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold text-foreground">{initialRating ? "Edit Your Review" : "Leave a Review"}</h2>
          <p className="text-sm text-foreground-muted mt-0.5">
            Help other collectors discover Vaultset.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Star rating */}
          <div>
            <p className="text-xs font-medium text-foreground-muted mb-2">Rating</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  className="text-2xl transition-colors"
                  aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                >
                  <span className={(hovered || rating) >= star ? "text-gold" : "text-border"}>
                    ★
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Review body */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1.5">
              Your review
            </label>
            <textarea
              rows={3}
              maxLength={MAX_CHARS}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's made Vaultset useful for you?"
              className="w-full rounded-xl border border-border bg-surface-raised px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none resize-none"
            />
            <p className={`text-xs mt-1 text-right ${charsLeft <= 20 ? "text-gold" : "text-foreground-muted"}`}>
              {charsLeft} characters left
            </p>
          </div>

          {/* Attribution — the profile username or nothing. No free-text names. */}
          <div>
            <p className="text-xs font-medium text-foreground-muted mb-1.5">Posting as</p>
            <label className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-raised px-4 py-3 cursor-pointer hover:border-gold/40 transition-colors">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
              />
              <span className="text-sm text-foreground">
                Post anonymously
                <span className="block text-xs text-foreground-muted mt-0.5">
                  {anonymous
                    ? "Shown as “Anonymous collector” — your username stays private."
                    : `Shown as “${username}”.`}
                </span>
              </span>
            </label>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-border py-2.5 text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-full bg-gold py-2.5 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-50 transition-colors"
            >
              {isPending ? "Submitting…" : "Submit Review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
