"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { createClient } from "@/utils/supabase/client";

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_system?: boolean;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MessageThread({
  conversationId,
  currentUserId,
  partnerUsername,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  partnerUsername: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription for new messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Mark incoming messages as read immediately
          if (newMsg.sender_id !== currentUserId) {
            supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMsg.id)
              .then(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
    });
    if (!error) {
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
    setSending(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as FormEvent);
    }
  }

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  // Group messages by day
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const label = formatDate(msg.created_at);
    if (!grouped.length || grouped[grouped.length - 1].date !== label) {
      grouped.push({ date: label, msgs: [msg] });
    } else {
      grouped[grouped.length - 1].msgs.push(msg);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col h-[580px]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-foreground-muted text-center">
              Start the conversation with @{partnerUsername}.
            </p>
          </div>
        ) : (
          grouped.map(({ date, msgs }) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-foreground-muted shrink-0">{date}</span>
                <div className="flex-1 border-t border-border" />
              </div>
              {msgs.map((msg) => {
                if (msg.is_system) {
                  return (
                    <div key={msg.id} className="flex justify-center py-1">
                      <div className="flex flex-col items-center gap-1 max-w-sm text-center">
                        <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground-muted">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70">
                            <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                          </svg>
                          <span>System</span>
                        </div>
                        <p className="text-xs text-foreground-muted leading-relaxed px-2">{msg.body}</p>
                        <span className="text-xs text-foreground-muted/60">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  );
                }

                const isOwn = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`flex flex-col max-w-xs lg:max-w-sm ${
                        isOwn ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                          isOwn
                            ? "bg-gold text-background rounded-br-sm"
                            : "bg-surface-raised text-foreground rounded-bl-sm border border-border"
                        }`}
                      >
                        {msg.body}
                      </div>
                      <span className="mt-1 text-xs text-foreground-muted px-1">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4 space-y-2">
        <form onSubmit={sendMessage} className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Type a message…"
            rows={1}
            maxLength={2000}
            className="flex-1 resize-none rounded-xl border border-border bg-surface-raised px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold/40 focus:outline-none transition-colors"
            style={{ minHeight: "40px", maxHeight: "120px" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="shrink-0 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
        <p className="text-xs text-foreground-muted">
          Enter to send &middot; Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
