"use client";

import { useState } from "react";
import { ReviewModal } from "@/components/ReviewModal";

export function EditReviewButton({
  username,
  existingRating,
  existingBody,
  existingDisplayName,
}: {
  username: string;
  existingRating?: number;
  existingBody?: string;
  existingDisplayName?: string;
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
        className="text-sm text-gold hover:underline transition-colors"
      >
        {hasReview ? "Edit your review" : "Leave a review"}
      </button>

      {open && (
        <ReviewModal
          username={username}
          initialRating={existingRating}
          initialBody={existingBody}
          initialDisplayName={existingDisplayName}
          onClose={() => setOpen(false)}
          onSubmitted={() => { setOpen(false); setSubmitted(true); }}
        />
      )}
    </>
  );
}
