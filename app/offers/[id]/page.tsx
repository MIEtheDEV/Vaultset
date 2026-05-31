/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { timeAgo } from "@/lib/timeAgo";
import { OfferActions } from "@/components/OfferActions";
import { MarkReceivedButton, WaitingForConfirmation } from "@/components/MarkReceivedButton";
import { CancelAcceptedButton } from "@/components/CancelAcceptedButton";

export const metadata: Metadata = {
  title: "Offer Detail",
  robots: { index: false },
};

const OFFER_TYPE_LABEL: Record<string, string> = {
  cash:   "Cash Offer",
  trade:  "Trade Offer",
  bundle: "Bundle Request",
};

const STATUS_CLASSES: Record<string, string> = {
  pending:   "text-gold bg-gold/10 border-gold/30",
  accepted:  "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  declined:  "text-red-400 bg-red-400/10 border-red-400/30",
  cancelled: "text-foreground-muted bg-surface border-border",
  countered: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  completed: "text-teal-400 bg-teal-400/10 border-teal-400/30",
};

const OFFER_EXPIRY_DAYS = 7;

function daysUntilExpiry(createdAt: string): number {
  const expiry = new Date(createdAt);
  expiry.setDate(expiry.getDate() + OFFER_EXPIRY_DAYS);
  return Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
}

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: offer } = await admin
    .from("offers")
    .select(`
      id, offer_type, offer_amount, message, status, created_at,
      sender_id, recipient_id, parent_offer_id,
      listing:collection_items!listing_id(
        id, for_sale, for_trade, list_price, condition, grader, grade,
        cards(name, set_name, card_number, image_url)
      )
    `)
    .eq("id", id)
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .maybeSingle();

  if (!offer) redirect("/offers");

  const isRecipient = offer.recipient_id === user.id;
  const isSender    = offer.sender_id    === user.id;
  const status      = offer.status as string;
  const offerType   = offer.offer_type as string;
  const otherId     = isRecipient ? offer.sender_id as string : offer.recipient_id as string;

  // Parallel fetch: profiles, offer items, pending counts (when accepted), counter-offer link
  const pendingCountsNeeded = status === "accepted";

  const [
    { data: profiles },
    { data: offerItems },
    myPendingRes,
    theirPendingRes,
    counterOfferRes,
  ] = await Promise.all([
    admin.from("profiles").select("id, username").in("id", [offer.sender_id, offer.recipient_id]),
    admin
      .from("offer_items")
      .select(`
        id, role,
        collection_items(
          id, condition, grader, grade,
          cards(name, set_name, image_url)
        )
      `)
      .eq("offer_id", offer.id),
    pendingCountsNeeded
      ? admin.from("collection_items")
          .select("id", { count: "exact", head: true })
          .eq("from_offer_id", id)
          .eq("user_id", user.id)
          .eq("transfer_status", "pending")
      : Promise.resolve({ count: 0, data: null, error: null }),
    pendingCountsNeeded
      ? admin.from("collection_items")
          .select("id", { count: "exact", head: true })
          .eq("from_offer_id", id)
          .eq("user_id", otherId)
          .eq("transfer_status", "pending")
      : Promise.resolve({ count: 0, data: null, error: null }),
    // Find a counter-offer that references this offer (so we can link to it when countered)
    status === "countered"
      ? admin.from("offers")
          .select("id")
          .eq("parent_offer_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const myPendingCount    = (myPendingRes as any).count ?? 0;
  const theirPendingCount = (theirPendingRes as any).count ?? 0;
  const counterOffer      = (counterOfferRes as any).data as { id: string } | null;

  const profileMap        = new Map((profiles ?? []).map((p) => [p.id, p.username]));
  const senderUsername    = profileMap.get(offer.sender_id as string)    ?? "unknown";
  const recipientUsername = profileMap.get(offer.recipient_id as string) ?? "unknown";
  const otherUsername     = isRecipient ? senderUsername : recipientUsername;

  const listing = offer.listing as any;
  const cards   = listing?.cards;
  const card    = Array.isArray(cards) ? cards[0] : cards;

  const expiryDays = status === "pending" ? daysUntilExpiry(offer.created_at as string) : null;

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <Link
        href="/offers"
        className="text-sm text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1.5 w-fit"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        My Offers
      </Link>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {OFFER_TYPE_LABEL[offerType] ?? offerType}
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">
              {isSender
                ? <>To <span className="text-gold">@{recipientUsername}</span></>
                : <>From <span className="text-gold">@{senderUsername}</span></>
              }
              {" · "}
              {timeAgo(offer.created_at as string)}
            </p>
            {expiryDays !== null && (
              <p className={`text-xs mt-0.5 ${expiryDays <= 0 ? "text-red-400" : expiryDays <= 2 ? "text-red-400" : "text-foreground-muted"}`}>
                {expiryDays <= 0 ? "Expired" : `Expires in ${expiryDays} day${expiryDays !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>
          <span className={`rounded-full border px-3 py-1 text-sm font-medium capitalize flex-shrink-0 ${STATUS_CLASSES[status] ?? ""}`}>
            {status}
          </span>
        </div>

        {/* Counter-offer chain banner */}
        {(offer as any).parent_offer_id && (
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 px-4 py-2.5 text-xs text-foreground-muted">
            This is a counter-offer.{" "}
            <Link href={`/offers/${(offer as any).parent_offer_id}`} className="text-gold hover:underline">
              View original offer →
            </Link>
          </div>
        )}

        {/* Countered: link to the counter-offer */}
        {status === "countered" && counterOffer && (
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 px-4 py-2.5 text-xs text-foreground-muted">
            A counter-offer was sent.{" "}
            <Link href={`/offers/${counterOffer.id}`} className="text-gold hover:underline">
              View counter-offer →
            </Link>
          </div>
        )}

        {/* Listing context */}
        {card && (
          <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-4">
            {card.image_url && (
              <div className="relative w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-surface-raised">
                <Image src={card.image_url} alt={card.name} fill sizes="56px" className="object-contain" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate">{card.name}</p>
              <p className="text-xs text-foreground-muted truncate">
                {card.set_name}{card.card_number ? ` · #${card.card_number}` : ""}
              </p>
              {listing?.for_sale && listing?.list_price != null && (
                <p className="text-xs text-gold mt-0.5">Listed at ${Number(listing.list_price).toFixed(2)}</p>
              )}
            </div>
            {listing?.id && (
              <Link
                href={`/marketplace/${listing.id}`}
                className="text-xs text-gold hover:text-gold-light transition-colors flex-shrink-0"
              >
                View listing →
              </Link>
            )}
          </div>
        )}

        {/* Offer details */}
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Offer Details</p>

          {offer.offer_amount != null && (
            <div>
              <p className="text-xs text-foreground-muted mb-0.5">Offered amount</p>
              <p className="text-3xl font-bold text-gold">${Number(offer.offer_amount).toFixed(2)}</p>
            </div>
          )}

          {/* Items offered by buyer (trade) */}
          {(() => {
            const offered = (offerItems ?? []).filter((i) => i.role === "offered");
            if (!offered.length) return null;
            return (
              <div>
                <p className="text-xs text-foreground-muted mb-2">Cards offered in exchange</p>
                <ItemList items={offered} />
              </div>
            );
          })()}

          {/* Additional items requested by buyer (bundle) */}
          {(() => {
            const requested = (offerItems ?? []).filter((i) => i.role === "requested");
            if (!requested.length) return null;
            return (
              <div>
                <p className="text-xs text-foreground-muted mb-2">Additional items requested</p>
                <ItemList items={requested} />
              </div>
            );
          })()}

          {offer.message && (
            <div>
              <p className="text-xs text-foreground-muted mb-0.5">Note</p>
              <p className="text-sm text-foreground">{offer.message as string}</p>
            </div>
          )}
        </div>

        {/* ── Pending: accept / decline / counter / cancel ── */}
        {status === "pending" && (
          <OfferActions
            offerId={offer.id as string}
            isRecipient={isRecipient}
            isSender={isSender}
            senderId={offer.sender_id as string}
            recipientId={offer.recipient_id as string}
            listingId={listing?.id}
            offerType={offerType}
            offerAmount={offer.offer_amount as number | null}
            offerItems={offerItems as any ?? []}
          />
        )}

        {/* ── Accepted: two-phase receipt + cancel deal ── */}
        {status === "accepted" && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4">
            <p className="text-sm font-semibold text-emerald-400">Deal Accepted</p>

            {/* Cash offer: only buyer needs to confirm */}
            {offerType === "cash" && isSender && (
              <>
                <p className="text-xs text-foreground-muted">
                  Once you receive the card, mark it as received to complete the transaction and add it to your inventory.
                </p>
                {myPendingCount > 0
                  ? <MarkReceivedButton offerId={offer.id as string} />
                  : <WaitingForConfirmation />
                }
              </>
            )}
            {offerType === "cash" && isRecipient && (
              <p className="text-xs text-foreground-muted">
                Ship the card and wait for <span className="text-gold">@{senderUsername}</span> to confirm receipt.
              </p>
            )}

            {/* Trade/bundle: both parties receive items */}
            {(offerType === "trade" || offerType === "bundle") && (
              <>
                {myPendingCount > 0 && theirPendingCount > 0 && (
                  <p className="text-xs text-foreground-muted">
                    Ship your items and mark as received once the other party&apos;s items arrive. Both of you must confirm.
                  </p>
                )}
                {myPendingCount > 0 && theirPendingCount === 0 && (
                  <p className="text-xs text-foreground-muted">
                    <span className="text-gold">@{otherUsername}</span> has confirmed receipt. Mark as received when your items arrive.
                  </p>
                )}
                {myPendingCount > 0
                  ? <MarkReceivedButton offerId={offer.id as string} />
                  : <WaitingForConfirmation />
                }
              </>
            )}

            <div className="pt-1 border-t border-emerald-500/10">
              <CancelAcceptedButton offerId={offer.id as string} />
            </div>
          </div>
        )}

        {/* ── Terminal states ── */}
        {(["declined", "cancelled", "countered", "completed"] as string[]).includes(status) && (
          <div className="rounded-2xl border border-border bg-surface p-4 text-center">
            <p className="text-sm text-foreground-muted">
              This offer has been{" "}
              <span className="text-foreground font-medium">{status}</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemList({ items }: { items: any[] }) {
  return (
    <div className="space-y-2">
      {items.map((oi) => {
        const ci      = oi.collection_items;
        const item    = Array.isArray(ci) ? ci[0] : ci;
        const cardArr = item?.cards;
        const c       = Array.isArray(cardArr) ? cardArr[0] : cardArr;
        return (
          <div key={oi.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
            {c?.image_url && (
              <Image src={c.image_url} alt={c.name ?? ""} width={28} height={38} className="object-contain flex-shrink-0 rounded" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{c?.name ?? "Unknown"}</p>
              <p className="text-xs text-foreground-muted truncate">{c?.set_name ?? ""}</p>
              <p className="text-xs text-foreground-muted capitalize">
                {item?.grader ? `${item.grader} ${item.grade}` : (item?.condition?.replace(/_/g, " ") ?? "")}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
