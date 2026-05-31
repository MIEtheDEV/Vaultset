/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { timeAgo } from "@/lib/timeAgo";

export const metadata: Metadata = {
  title: "My Offers",
  robots: { index: false },
};

const OFFER_EXPIRY_DAYS = 7;

function daysUntilExpiry(createdAt: string): number {
  const expiry = new Date(createdAt);
  expiry.setDate(expiry.getDate() + OFFER_EXPIRY_DAYS);
  return Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
}

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

const OFFER_SELECT = `
  id, offer_type, offer_amount, status, created_at, sender_id, recipient_id,
  listing:collection_items!listing_id(
    id,
    cards(name, set_name, image_url)
  )
` as const;

export default async function OffersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [receivedRes, sentRes] = await Promise.all([
    admin
      .from("offers")
      .select(OFFER_SELECT)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("offers")
      .select(OFFER_SELECT)
      .eq("sender_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const received = receivedRes.data ?? [];
  const sent     = sentRes.data ?? [];

  const allIds = [...new Set([
    ...received.map((o) => o.sender_id as string),
    ...sent.map((o) => o.recipient_id as string),
  ])];

  const { data: profiles } = allIds.length
    ? await admin.from("profiles").select("id, username").in("id", allIds)
    : { data: [] as { id: string; username: string }[] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const ACTIVE = new Set(["pending", "accepted"]);

  const activeReceived  = received.filter((o) => ACTIVE.has(o.status as string));
  const historyReceived = received.filter((o) => !ACTIVE.has(o.status as string));
  const activeSent      = sent.filter((o) => ACTIVE.has(o.status as string));
  const historySent     = sent.filter((o) => !ACTIVE.has(o.status as string));

  const pendingCount = activeReceived.filter((o) => o.status === "pending").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Offers</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Manage trade proposals, cash offers, and bundle requests.
        </p>
      </div>

      {/* Received */}
      <section className="space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          Received
          {pendingCount > 0 && (
            <span className="rounded-full bg-gold/10 border border-gold/30 px-2 py-0.5 text-xs font-medium text-gold">
              {pendingCount} pending
            </span>
          )}
        </h2>

        {activeReceived.length === 0 && historyReceived.length === 0 ? (
          <EmptyState message="No offers received yet." />
        ) : (
          <div className="space-y-3">
            {activeReceived.length > 0 && (
              <OfferList offers={activeReceived} profileMap={profileMap} direction="received" />
            )}
            {historyReceived.length > 0 && (
              <HistorySection offers={historyReceived} profileMap={profileMap} direction="received" />
            )}
          </div>
        )}
      </section>

      {/* Sent */}
      <section className="space-y-4">
        <h2 className="font-semibold text-foreground">Sent</h2>

        {activeSent.length === 0 && historySent.length === 0 ? (
          <EmptyState message="No offers sent yet. Browse the marketplace to make offers." />
        ) : (
          <div className="space-y-3">
            {activeSent.length > 0 && (
              <OfferList offers={activeSent} profileMap={profileMap} direction="sent" />
            )}
            {historySent.length > 0 && (
              <HistorySection offers={historySent} profileMap={profileMap} direction="sent" />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function OfferRow({
  offer,
  profileMap,
  direction,
}: {
  offer: any;
  profileMap: Map<string, string>;
  direction: "received" | "sent";
}) {
  const otherId   = direction === "received" ? offer.sender_id : offer.recipient_id;
  const username  = profileMap.get(otherId as string) ?? "unknown";
  const listing   = offer.listing as any;
  const cards     = listing?.cards;
  const card      = Array.isArray(cards) ? cards[0] : cards;
  const typeLabel = OFFER_TYPE_LABEL[offer.offer_type as string] ?? offer.offer_type;

  const expiryDays = offer.status === "pending" ? daysUntilExpiry(offer.created_at as string) : null;

  return (
    <Link
      href={`/offers/${offer.id}`}
      className="flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition-colors gap-4"
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap text-sm">
          <span className="font-medium text-foreground">{typeLabel}</span>
          <span className="text-foreground-muted">{direction === "received" ? "from" : "to"}</span>
          <span className="text-gold">@{username}</span>
        </div>
        <p className="text-xs text-foreground-muted truncate">
          {card?.name ?? "Unknown card"}
          {card?.set_name ? ` · ${card.set_name}` : ""}
        </p>
        {offer.offer_amount != null && (
          <p className="text-xs text-gold font-medium">${Number(offer.offer_amount).toFixed(2)}</p>
        )}
        <div className="flex items-center gap-2">
          <p className="text-xs text-foreground-muted">{timeAgo(offer.created_at)}</p>
          {expiryDays !== null && (
            expiryDays <= 0
              ? <span className="text-xs text-red-400">Expired</span>
              : expiryDays <= 2
                ? <span className="text-xs text-red-400">Expires in {expiryDays}d</span>
                : <span className="text-xs text-foreground-muted">Expires in {expiryDays}d</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_CLASSES[offer.status as string] ?? ""}`}>
          {offer.status}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground-muted">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}

function OfferList({
  offers,
  profileMap,
  direction,
}: {
  offers: any[];
  profileMap: Map<string, string>;
  direction: "received" | "sent";
}) {
  // Sort: pending first, then accepted, then by date
  const sorted = [...offers].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return 0;
  });

  return (
    <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
      {sorted.map((offer) => (
        <OfferRow key={offer.id} offer={offer} profileMap={profileMap} direction={direction} />
      ))}
    </div>
  );
}

function HistorySection({
  offers,
  profileMap,
  direction,
}: {
  offers: any[];
  profileMap: Map<string, string>;
  direction: "received" | "sent";
}) {
  return (
    <details className="group">
      <summary className="flex items-center gap-2 cursor-pointer list-none text-sm text-foreground-muted hover:text-foreground transition-colors select-none">
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform group-open:rotate-90 flex-shrink-0"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        History ({offers.length})
      </summary>
      <div className="mt-2 rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
        {offers.map((offer) => (
          <OfferRow key={offer.id} offer={offer} profileMap={profileMap} direction={direction} />
        ))}
      </div>
    </details>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface py-12 text-center">
      <p className="text-sm text-foreground-muted">{message}</p>
    </div>
  );
}
