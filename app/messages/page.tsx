import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AVATAR_COLORS, resolveAvatarColor, isHexColor } from "@/lib/avatarColors";
import { timeAgo } from "@/lib/timeAgo";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false },
};

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, updated_at, participant_1, participant_2")
    .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  const convIds = convs?.map((c) => c.id) ?? [];
  const partnerIds = [
    ...new Set(
      convs?.map((c) => (c.participant_1 === user.id ? c.participant_2 : c.participant_1)) ?? []
    ),
  ];

  const [profilesResult, messagesResult, unreadResult] = await Promise.all([
    partnerIds.length > 0
      ? supabase.from("profiles").select("id, username, avatar_color").in("id", partnerIds)
      : { data: [] as { id: string; username: string; avatar_color: string | null }[] },
    convIds.length > 0
      ? supabase
          .from("messages")
          .select("id, conversation_id, body, created_at, sender_id")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] as { id: string; conversation_id: string; body: string; created_at: string; sender_id: string }[] },
    convIds.length > 0
      ? supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", convIds)
          .neq("sender_id", user.id)
          .is("read_at", null)
      : { data: [] as { conversation_id: string }[] },
  ]);

  const profileMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));

  const lastMessageMap = new Map<string, { body: string; created_at: string; sender_id: string }>();
  (messagesResult.data ?? []).forEach((msg) => {
    if (!lastMessageMap.has(msg.conversation_id)) {
      lastMessageMap.set(msg.conversation_id, msg);
    }
  });

  const unreadMap = new Map<string, number>();
  (unreadResult.data ?? []).forEach((msg) => {
    unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) ?? 0) + 1);
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Messages</h1>

      {(!convs || convs.length === 0) ? (
        <div className="rounded-2xl border border-border bg-surface py-16 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">No conversations yet</p>
          <p className="text-xs text-foreground-muted">
            Message a seller from a marketplace listing or a collector&apos;s profile.
          </p>
          <Link
            href="/marketplace"
            className="mt-2 inline-block rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
          >
            Browse the marketplace
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
          {convs.map((conv) => {
            const partnerId =
              conv.participant_1 === user.id ? conv.participant_2 : conv.participant_1;
            const partner = profileMap.get(partnerId);
            const lastMsg = lastMessageMap.get(conv.id);
            const unread = unreadMap.get(conv.id) ?? 0;
            const initial = (partner?.username ?? "?").charAt(0).toUpperCase();

            const storedColor = partner?.avatar_color ?? null;
            const customHex = storedColor && isHexColor(storedColor) ? storedColor : null;
            const avatar = customHex
              ? null
              : AVATAR_COLORS[resolveAvatarColor(storedColor, partner?.username ?? "")];

            return (
              <Link
                key={conv.id}
                href={`/messages/${conv.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition-colors"
              >
                {customHex ? (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold select-none"
                    style={{
                      background: customHex + "22",
                      borderColor: customHex + "66",
                      color: customHex,
                    }}
                  >
                    {initial}
                  </div>
                ) : (
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold select-none ${avatar?.bg ?? "bg-surface-raised"} ${avatar?.border ?? "border-border"} ${avatar?.text ?? "text-foreground-muted"}`}
                  >
                    {initial}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium truncate ${
                        unread > 0 ? "text-foreground" : "text-foreground-muted"
                      }`}
                    >
                      @{partner?.username ?? "Unknown"}
                    </span>
                    <span className="text-xs text-foreground-muted shrink-0">
                      {lastMsg
                        ? timeAgo(lastMsg.created_at)
                        : timeAgo(conv.updated_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p
                      className={`text-xs truncate flex-1 ${
                        unread > 0 ? "text-foreground" : "text-foreground-muted"
                      }`}
                    >
                      {lastMsg
                        ? `${lastMsg.sender_id === user.id ? "You: " : ""}${lastMsg.body}`
                        : "No messages yet"}
                    </p>
                    {unread > 0 && (
                      <span className="shrink-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-0.5 text-[10px] font-bold text-background">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
