"use client";

import { useState } from "react";
import { ReviewModal } from "@/components/ReviewModal";

const VARIANTS = {
  link:   "text-sm text-gold hover:underline transition-colors",
  button: "inline-block rounded-full border border-gold/40 px-6 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10 transition-colors",
};

export function EditReviewButton({
  username,
  existingRating,
  existingBody,
  existingAnonymous,
  variant = "link",
}: {
  username: string;
  existingRating?: number;
  existingBody?: string;
  existingAnonymous?: boolean;
  variant?: keyof typeof VARIANTS;
}) {
  const [open,      setOpen]      = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const hasReview = !!existingRating;

  if (submitted) {
    return <p className="text-sm text-emerald-400">Review updated — pending approval.</p>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={VARIANTS[variant]}
      >
        {hasReview ? "Edit your review" : "Leave a review"}
      </button>

      {open && (
        <ReviewModal
          username={username}
          initialRating={existingRating}
          initialBody={existingBody}
          initialAnonymous={existingAnonymous}
          onClose={() => setOpen(false)}
          onSubmitted={() => { setOpen(false); setSubmitted(true); }}
        />
      )}
    </>
  );
}
