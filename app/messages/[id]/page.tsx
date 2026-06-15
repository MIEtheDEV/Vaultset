/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { MessageThread } from "@/components/MessageThread";
import { ConversationMuteToggle } from "@/components/ConversationMuteToggle";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false },
};

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, participant_1, participant_2, listing_id, created_at")
    .eq("id", id)
    .maybeSingle();

  if (
    !conv ||
    (conv.participant_1 !== user.id && conv.participant_2 !== user.id)
  ) {
    redirect("/messages");
  }

  const partnerId =
    conv.participant_1 === user.id ? conv.participant_2 : conv.participant_1;

  // Mark partner's unread messages as read immediately
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .neq("sender_id", user.id)
    .is("read_at", null);

  // Keep the notification bell in sync: clear this conversation's new_message
  // notifications now that the user is reading the thread. notifications has no
  // user UPDATE policy, so this goes through the service-role client.
  await createAdminClient()
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("type", "new_message")
    .eq("data->>conversation_id", id)
    .eq("read", false);

  const [partnerResult, messagesResult, listingResult, muteResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_color")
      .eq("id", partnerId)
      .single(),
    supabase
      .from("messages")
      .select("id, sender_id, body, created_at, is_system")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
    conv.listing_id
      ? supabase
          .from("collection_items")
          .select(
            "id, for_sale, for_trade, list_price, cards ( name, set_name, image_url )"
          )
          .eq("id", conv.listing_id)
          .maybeSingle()
      : { data: null },
    supabase
      .from("conversation_mutes")
      .select("conversation_id")
      .eq("user_id", user.id)
      .eq("conversation_id", id)
      .maybeSingle(),
  ]);

  const partnerProfile = partnerResult.data;
  const messages = messagesResult.data ?? [];
  const isMuted = !!muteResult.data;

  const listingItem = listingResult.data;
  const listingCard = listingItem
    ? (() => {
        const raw = (listingItem as any).cards;
        return Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
      })()
    : null;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Back */}
      <Link
        href="/messages"
        className="text-sm text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1.5 w-fit"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Messages
      </Link>

      {/* Thread header */}
      <div className="rounded-2xl border border-border bg-surface px-5 py-4 flex items-center justify-between gap-4">
        <Link
          href={`/profile/${partnerProfile?.username}`}
          className="text-sm font-semibold text-foreground hover:text-gold transition-colors"
        >
          @{partnerProfile?.username ?? "Unknown"}
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          <ConversationMuteToggle conversationId={id} initialMuted={isMuted} />
          <Link
            href={`/profile/${partnerProfile?.username}`}
            className="text-xs text-foreground-muted hover:text-gold transition-colors"
          >
            View profile →
          </Link>
        </div>
      </div>

      {/* Listing context card */}
      {listingItem && listingCard && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3">
          <span className="text-xs text-foreground-muted shrink-0">Re:</span>
          {listingCard.image_url && (
            <div className="relative h-8 w-6 shrink-0 overflow-hidden rounded">
              <Image
                src={listingCard.image_url}
                alt={listingCard.name ?? ""}
                fill
                sizes="24px"
                className="object-contain"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {listingCard.name}
            </p>
            <p className="text-xs text-foreground-muted truncate">
              {listingCard.set_name}
            </p>
          </div>
          {(listingItem as any).for_sale &&
            (listingItem as any).list_price != null && (
              <span className="text-xs font-semibold text-gold shrink-0">
                ${Number((listingItem as any).list_price).toFixed(2)}
              </span>
            )}
          <Link
            href={`/marketplace/${conv.listing_id}`}
            className="text-xs text-gold hover:text-gold-light transition-colors shrink-0"
          >
            View →
          </Link>
        </div>
      )}

      {/* Realtime thread */}
      <MessageThread
        conversationId={id}
        currentUserId={user.id}
        partnerUsername={partnerProfile?.username ?? "Unknown"}
        initialMessages={messages.map((m) => ({
          id: m.id,
          sender_id: m.sender_id,
          body: m.body,
          created_at: m.created_at,
          is_system: (m as any).is_system ?? false,
        }))}
      />
    </div>
  );
}
