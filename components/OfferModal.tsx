"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { createOffer } from "@/app/offers/actions";

type OfferType = "cash" | "trade" | "bundle";

const MAX_PENDING_PER_LISTING = 3;

interface PickerItem {
  id: string;
  condition: string | null;
  grader: string | null;
  grade: number | null;
  card: { name: string; set_name: string; image_url: string | null } | null;
}

const MODAL_CONFIG: Record<OfferType, { title: string; subtitle: string }> = {
  cash:   { title: "Make an Offer",    subtitle: "Propose a cash price for this listing." },
  trade:  { title: "Propose a Trade",  subtitle: "Select cards from your inventory to offer in exchange." },
  bundle: { title: "Request a Bundle", subtitle: "Select additional items from this seller to include in the deal." },
};

export function OfferModal({
  listingId,
  recipientId,
  currentUserId,
  sellerUsername,
  cardName,
  listPrice,
}: {
  listingId: string;
  recipientId: string;
  currentUserId: string;
  sellerUsername: string;
  cardName: string;
  listPrice: number | null;
}) {
  const [open, setOpen] = useState<OfferType | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [availableItems, setAvailableItems] = useState<PickerItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [offerAmount, setOfferAmount] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Fetch picker items whenever a trade/bundle modal opens
  useEffect(() => {
    if (!open || open === "cash") return;

    let cancelled = false;
    setLoadingItems(true);
    setAvailableItems([]);

    async function load() {
      const supabase = createClient();

      const query = open === "trade"
        ? supabase
            .from("collection_items")
            .select("id, condition, grader, grade, cards(name, set_name, image_url)")
            .eq("user_id", currentUserId)
            .is("transfer_status", null)
            .eq("on_hold", false)
            .order("created_at", { ascending: false })
            .limit(100)
        : supabase
            .from("collection_items")
            .select("id, condition, grader, grade, cards(name, set_name, image_url)")
            .eq("user_id", recipientId)
            .or("for_sale.eq.true,for_trade.eq.true")
            .eq("on_hold", false)
            .neq("id", listingId)
            .order("created_at", { ascending: false })
            .limit(100);

      const { data } = await query;
      if (cancelled) return;

      setAvailableItems(
        (data ?? []).map((item: any) => ({
          id: item.id,
          condition: item.condition ?? null,
          grader: item.grader ?? null,
          grade: item.grade ?? null,
          card: Array.isArray(item.cards) ? (item.cards[0] ?? null) : (item.cards ?? null),
        }))
      );
      setLoadingItems(false);
    }

    load();
    return () => { cancelled = true; };
  }, [open, currentUserId, recipientId, listingId]);

  function openModal(type: OfferType) {
    setOpen(type);
    setSuccess(false);
    setError("");
    setSelectedIds(new Set());
    setOfferAmount(type === "cash" && listPrice != null ? listPrice.toFixed(2) : "");
    setMessage("");
  }

  function closeModal() {
    if (!isPending) setOpen(null);
  }

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (open !== "cash" && selectedIds.size === 0) {
      setError("Select at least one item to continue.");
      return;
    }

    const role = open === "trade" ? "offered" : "requested";

    startTransition(async () => {
      try {
        await createOffer({
          listingId,
          recipientId,
          offerType: open!,
          offerAmount:   open === "cash" ? (parseFloat(offerAmount) || null) : null,
          selectedItems: open !== "cash"
            ? [...selectedIds].map((id) => ({ itemId: id, role: role as "offered" | "requested" }))
            : [],
          message: message || null,
        });
        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <>
      {/* Trigger buttons */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => openModal("cash")}
          className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-3 py-3 text-center hover:border-gold/40 hover:bg-surface-raised transition-colors"
        >
          <span className="text-xs font-medium text-foreground">Make Offer</span>
          <span className="text-xs text-foreground-muted mt-0.5">Cash price</span>
        </button>
        <button
          type="button"
          onClick={() => openModal("trade")}
          className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-3 py-3 text-center hover:border-blue-400/40 hover:bg-surface-raised transition-colors"
        >
          <span className="text-xs font-medium text-foreground">Propose Trade</span>
          <span className="text-xs text-foreground-muted mt-0.5">Your cards</span>
        </button>
        <button
          type="button"
          onClick={() => openModal("bundle")}
          className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-3 py-3 text-center hover:border-violet-400/40 hover:bg-surface-raised transition-colors"
        >
          <span className="text-xs font-medium text-foreground">Request Bundle</span>
          <span className="text-xs text-foreground-muted mt-0.5">Their cards</span>
        </button>
      </div>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {success ? (
              <div className="text-center space-y-4 py-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Offer Sent!</p>
                  <p className="text-sm text-foreground-muted mt-1">
                    @{sellerUsername} will be notified.{" "}
                    <Link href="/offers" className="text-gold hover:underline" onClick={closeModal}>View My Offers</Link> for updates.
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="rounded-full border border-border px-6 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Header */}
                <div>
                  <h2 className="text-lg font-bold text-foreground">{MODAL_CONFIG[open].title}</h2>
                  <p className="text-sm text-foreground-muted mt-0.5">{MODAL_CONFIG[open].subtitle}</p>
                  <p className="text-xs text-foreground-muted mt-1.5">
                    For <span className="text-foreground">{cardName}</span> by{" "}
                    <span className="text-gold">@{sellerUsername}</span>
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">

                  {/* Cash offer: price input */}
                  {open === "cash" && (
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-1.5">
                        Your offer amount (USD)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(e.target.value)}
                          placeholder="0.00"
                          required
                          className="w-full rounded-xl border border-border bg-surface-raised pl-7 pr-4 py-2.5 text-sm text-foreground focus:border-gold/40 focus:outline-none"
                        />
                      </div>
                      {listPrice != null && (
                        <p className="text-xs text-foreground-muted mt-1">
                          Asking price: <span className="text-gold">${listPrice.toFixed(2)}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Trade / Bundle: card picker */}
                  {(open === "trade" || open === "bundle") && (
                    <div>
                      <label className="block text-xs font-medium text-foreground-muted mb-2">
                        {open === "trade"
                          ? "Select cards from your inventory to offer:"
                          : `Select additional items from @${sellerUsername}:`}
                      </label>

                      {loadingItems ? (
                        <div className="h-36 flex items-center justify-center rounded-xl border border-border bg-surface-raised">
                          <p className="text-sm text-foreground-muted">Loading…</p>
                        </div>
                      ) : availableItems.length === 0 ? (
                        <div className="h-36 flex items-center justify-center rounded-xl border border-border bg-surface-raised">
                          <p className="text-sm text-foreground-muted text-center px-4">
                            {open === "trade"
                              ? "No cards in your inventory yet."
                              : "No other listings available from this seller."}
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-surface-raised divide-y divide-border">
                          {availableItems.map((item) => {
                            const selected = selectedIds.has(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleItem(item.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                  selected ? "bg-gold/8" : "hover:bg-surface"
                                }`}
                              >
                                {item.card?.image_url ? (
                                  <img
                                    src={item.card.image_url}
                                    alt=""
                                    width={32}
                                    height={44}
                                    className="object-contain flex-shrink-0 rounded"
                                  />
                                ) : (
                                  <div className="w-8 h-11 rounded bg-surface flex-shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-foreground truncate">
                                    {item.card?.name ?? "Unknown"}
                                  </p>
                                  <p className="text-xs text-foreground-muted truncate">
                                    {item.card?.set_name ?? ""}
                                  </p>
                                  <p className="text-xs text-foreground-muted capitalize">
                                    {item.grader
                                      ? `${item.grader} ${item.grade}`
                                      : (item.condition?.replace(/_/g, " ") ?? "")}
                                  </p>
                                </div>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                                  selected ? "border-gold bg-gold" : "border-border"
                                }`}>
                                  {selected && (
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-background">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {selectedIds.size > 0 && (
                        <p className="text-xs text-gold mt-1.5">
                          {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
                        </p>
                      )}
                    </div>
                  )}

                  {/* Note to seller (all types) */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted mb-1.5">
                      Note to seller <span className="font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Any additional context…"
                      rows={2}
                      className="w-full rounded-xl border border-border bg-surface-raised px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold/40 focus:outline-none resize-none"
                    />
                  </div>

                  {error && (
                    error.startsWith("You already have") ? (
                      <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-xs text-foreground-muted">
                        <p className="font-medium text-gold mb-0.5">Offer limit reached</p>
                        <p>You have {MAX_PENDING_PER_LISTING} pending offers on this listing. Wait for a response before sending more.</p>
                        <Link href="/offers" className="text-gold hover:underline mt-1 inline-block" onClick={closeModal}>
                          View your offers →
                        </Link>
                      </div>
                    ) : (
                      <p className="text-xs text-red-400">{error}</p>
                    )
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex-1 rounded-full border border-border py-2.5 text-sm text-foreground-muted hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="flex-1 rounded-full bg-gold py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors disabled:opacity-50"
                    >
                      {isPending ? "Sending…" : "Send Offer"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
