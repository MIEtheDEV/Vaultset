"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

/**
 * Per-conversation mute toggle shown in a thread header. Muting inserts a row
 * into `conversation_mutes`; unmuting deletes it. This narrows the global
 * `push_messages` switch — a muted conversation never pushes even while global
 * chat notifications are on. In-app/bell notifications are unaffected.
 */
export function ConversationMuteToggle({
  conversationId,
  initialMuted,
}: {
  conversationId: string;
  initialMuted: boolean;
}) {
  const [muted, setMuted] = useState(initialMuted);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !muted;
    setMuted(next); // optimistic
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMuted(!next); setBusy(false); return; }

    const { error } = next
      ? await supabase
          .from("conversation_mutes")
          .upsert({ user_id: user.id, conversation_id: conversationId }, { onConflict: "user_id,conversation_id" })
      : await supabase
          .from("conversation_mutes")
          .delete()
          .eq("user_id", user.id)
          .eq("conversation_id", conversationId);

    if (error) setMuted(!next); // revert on failure
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={muted}
      title={muted ? "Muted — tap to unmute notifications" : "Mute notifications for this chat"}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        muted
          ? "border-border bg-surface-raised text-foreground-muted hover:text-foreground"
          : "border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
      }`}
    >
      {muted ? (
        // Bell with a slash
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
          <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
          <path d="M18 8a6 6 0 0 0-9.33-5" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )}
      {muted ? "Muted" : "Mute"}
    </button>
  );
}
