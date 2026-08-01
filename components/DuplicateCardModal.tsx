"use client";

import Image from "next/image";
import { FINISH_LABELS } from "@/lib/sets/setCardFinishes";

const CONDITION_LABELS: Record<string, string> = {
  mint:              "Mint",
  near_mint:         "Near Mint",
  lightly_played:    "Lightly Played",
  moderately_played: "Moderately Played",
  heavily_played:    "Heavily Played",
  damaged:           "Damaged",
};

export interface ExistingCopy {
  id: string;
  condition: string | null;
  finish: string | null;
  grader: string | null;
  grade: number | null;
  quantity: number;
}

function Chip({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "gold" }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
        tone === "gold"
          ? "border-gold/30 bg-gold/10 text-gold"
          : "border-border bg-surface-raised text-foreground"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wide text-foreground-muted">{label}</span>
      {value}
    </span>
  );
}

/**
 * Shown when the card being added is already in the collector's vault.
 *
 * Two moments, one modal:
 *  - "select" — fired the instant a card is picked (scanner or search), before any
 *    ownership details are typed. It's informational: a second copy in a different
 *    condition/grade/finish is a perfectly normal thing to own, so it never blocks.
 *  - "submit" — fired on save when the entry being created is identical to one that
 *    already exists (same finish, condition, grade). That one is worth confirming.
 *
 * Every copy renders its condition, grade and finish, because those are exactly the
 * axes that make two rows of the "same card" genuinely different collectibles.
 */
export function DuplicateCardModal({
  mode,
  copies,
  cardName,
  setName,
  cardNumber,
  imageUrl,
  saving = false,
  onEdit,
  onContinue,
  onDismiss,
}: {
  mode: "select" | "submit";
  copies: ExistingCopy[];
  cardName: string;
  setName?: string;
  cardNumber?: string;
  imageUrl?: string;
  saving?: boolean;
  onEdit: (id: string) => void;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const plural = copies.length === 1 ? "copy" : "copies";
  const totalQty = copies.reduce((sum, c) => sum + (c.quantity || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Card already in your vault"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 space-y-5"
      >
        <div className="flex gap-4">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={cardName}
              width={72}
              height={101}
              className="rounded-lg object-contain shadow-md flex-shrink-0 self-start"
            />
          )}
          <div>
            <h3 className="font-semibold text-foreground">
              {mode === "submit" ? "You already have this exact copy" : "Already in your vault"}
            </h3>
            <p className="mt-1 text-sm text-foreground-muted">
              {mode === "submit" ? (
                <>
                  An entry for <span className="text-foreground">{cardName}</span> with the same finish,
                  condition and grade is already in your vault. Add another only if you really own a
                  second one.
                </>
              ) : (
                <>
                  You already have {copies.length} {plural}
                  {totalQty > copies.length ? ` (${totalQty} cards)` : ""} of{" "}
                  <span className="text-foreground">{cardName}</span>
                  {setName ? ` — ${setName}` : ""}
                  {cardNumber ? ` · ${cardNumber}` : ""}. Check the details below — if yours differs in
                  condition, grade or finish, go ahead and add it.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            Existing {plural}
          </p>
          {copies.map((copy) => (
            <button
              key={copy.id}
              type="button"
              onClick={() => onEdit(copy.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 text-left hover:border-gold/40 transition-colors"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <Chip
                  label="Finish"
                  value={copy.finish ? FINISH_LABELS[copy.finish] ?? copy.finish : "Not set"}
                />
                {copy.grader || copy.grade != null ? (
                  <Chip
                    label="Grade"
                    tone="gold"
                    value={`${copy.grader ?? "Graded"}${copy.grade != null ? ` ${copy.grade}` : ""}`}
                  />
                ) : (
                  <Chip
                    label="Condition"
                    value={copy.condition ? CONDITION_LABELS[copy.condition] ?? copy.condition : "Not set"}
                  />
                )}
                {copy.quantity > 1 && <Chip label="Qty" value={`×${copy.quantity}`} />}
              </span>
              <span className="shrink-0 text-xs font-medium text-gold">Edit →</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
          >
            {mode === "submit" ? "Go Back" : "Pick a Different Card"}
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={saving}
            className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {mode === "submit"
              ? saving
                ? "Saving…"
                : "Add Anyway"
              : "Add Another Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
