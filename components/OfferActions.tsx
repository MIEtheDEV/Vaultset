/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToOffer, cancelOffer, counterOffer } from "@/app/offers/actions";
import { getOrCreateConversation } from "@/app/messages/actions";

type OfferItem = {
  id: string;
  role: string;
  collection_items: {
    id: string;
    condition: string | null;
    grader: string | null;
    grade: number | null;
    cards:
      | { name: string; set_name: string; image_url: string | null }
      | Array<{ name: string; set_name: string; image_url: string | null }>
      | null;
  } | null;
};

export function OfferActions({
  offerId,
  isRecipient,
  isSender,
  senderId,
  recipientId,
  listingId,
  offerType,
  offerAmount,
  offerItems = [],
}: {
  offerId: string;
  isRecipient: boolean;
  isSender: boolean;
  senderId: string;
  recipientId: string;
  listingId?: string;
  offerType?: string;
  offerAmount?: number | null;
  offerItems?: OfferItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Counter-offer state
  const [showCounter, setShowCounter] = useState(false);
  const [counterAmount, setCounterAmount] = useState(
    offerAmount != null ? String(offerAmount) : ""
  );
  const [counterMessage, setCounterMessage] = useState("");
  const [counterError, setCounterError] = useState("");

  // Partial bundle: all requested item IDs checked by default
  const bundleItems = offerItems.filter((i) => i.role === "requested");
  const [keptItemIds, setKeptItemIds] = useState<Set<string>>(
    () => new Set(bundleItems.map((i) => i.collection_items?.id).filter(Boolean) as string[])
  );

  function getCardFromItem(oi: OfferItem) {
    const ci = oi.collection_items;
    if (!ci) return null;
    const cards = ci.cards;
    return Array.isArray(cards) ? cards[0] ?? null : cards;
  }

  function toggleKept(id: string) {
    setKeptItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function handleRespond(action: "accepted" | "declined") {
    setError("");
    startTransition(async () => {
      try {
        const kept = offerType === "bundle" ? [...keptItemIds] : undefined;
        await respondToOffer(offerId, action, kept);
        if (action === "accepted") {
          const otherId = isRecipient ? senderId : recipientId;
          const convId = await getOrCreateConversation(otherId, listingId);
          router.push(`/messages/${convId}`);
        } else {
          router.push("/offers");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleCancel() {
    setError("");
    startTransition(async () => {
      try {
        await cancelOffer(offerId);
        router.push("/offers");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleNegotiate() {
    startTransition(async () => {
      try {
        const otherId = isRecipient ? senderId : recipientId;
        const convId = await getOrCreateConversation(otherId, listingId);
        router.push(`/messages/${convId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleCounter() {
    setCounterError("");
    const amt = parseFloat(counterAmount);
    if (offerType === "cash" && (!counterAmount || isNaN(amt) || amt <= 0)) {
      setCounterError("Enter a valid counter amount.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await counterOffer({
          offerId,
          counterAmount: offerType === "cash" ? amt : null,
          message: counterMessage || null,
        });
        router.push(`/offers/${result.id}`);
      } catch (err) {
        setCounterError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">

      {/* Partial bundle item selection */}
      {isRecipient && offerType === "bundle" && bundleItems.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-raised p-3 space-y-2">
          <p className="text-xs font-medium text-foreground-muted">
            Items to include in this deal — uncheck any you cannot include:
          </p>
          <div className="space-y-1">
            {bundleItems.map((oi) => {
              const card = getCardFromItem(oi);
              const itemId = oi.collection_items?.id;
              if (!itemId) return null;
              return (
                <label
                  key={oi.id}
                  className="flex items-center gap-2.5 cursor-pointer py-1"
                >
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      keptItemIds.has(itemId) ? "border-gold bg-gold" : "border-border bg-surface"
                    }`}
                    onClick={() => toggleKept(itemId)}
                  >
                    {keptItemIds.has(itemId) && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-background">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-foreground truncate">
                    {card?.name ?? "Unknown card"}
                    {card?.set_name ? <span className="text-foreground-muted"> · {card.set_name}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-foreground-muted">
            {keptItemIds.size} of {bundleItems.length} items included
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Recipient actions */}
      {isRecipient && !showCounter && (
        <div className="flex gap-2.5">
          <button
            onClick={() => handleRespond("declined")}
            disabled={isPending}
            className="flex-1 rounded-full border border-border py-3 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-red-500/40 transition-colors disabled:opacity-50"
          >
            Decline
          </button>

          {offerType === "cash" ? (
            <button
              onClick={() => setShowCounter(true)}
              disabled={isPending}
              className="flex-1 rounded-full border border-border py-3 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors disabled:opacity-50"
            >
              Counter
            </button>
          ) : (
            <button
              onClick={handleNegotiate}
              disabled={isPending}
              className="flex-1 rounded-full border border-border py-3 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors disabled:opacity-50"
            >
              {isPending ? "Opening…" : "Negotiate"}
            </button>
          )}

          <button
            onClick={() => handleRespond("accepted")}
            disabled={isPending || (offerType === "bundle" && keptItemIds.size === 0)}
            className="flex-1 rounded-full bg-gold py-3 text-sm font-semibold text-background hover:bg-gold-light transition-colors disabled:opacity-50"
          >
            {isPending ? "Processing…" : "Accept & Message"}
          </button>
        </div>
      )}

      {/* Counter-offer form (cash only) */}
      {isRecipient && showCounter && offerType === "cash" && (
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Counter Offer</p>

          <div>
            <label className="block text-xs text-foreground-muted mb-1.5">
              Your counter amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-border bg-surface pl-7 pr-4 py-2.5 text-sm text-foreground focus:border-gold/40 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-foreground-muted mb-1.5">
              Message <span className="font-normal">(optional)</span>
            </label>
            <textarea
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              placeholder="Explain your counter…"
              rows={2}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold/40 focus:outline-none resize-none"
            />
          </div>

          {counterError && <p className="text-xs text-red-400">{counterError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCounter(false)}
              disabled={isPending}
              className="flex-1 rounded-full border border-border py-2.5 text-sm text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCounter}
              disabled={isPending}
              className="flex-1 rounded-full bg-gold py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors disabled:opacity-50"
            >
              {isPending ? "Sending…" : "Send Counter"}
            </button>
          </div>
        </div>
      )}

      {/* Sender: cancel pending offer */}
      {isSender && (
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="w-full rounded-full border border-border py-3 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-red-500/40 transition-colors disabled:opacity-50"
        >
          {isPending ? "Cancelling…" : "Cancel Offer"}
        </button>
      )}
    </div>
  );
}
