"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateConversation } from "@/app/messages/actions";

export function MessageButton({
  recipientId,
  listingId,
  label = "Message",
  className,
}: {
  recipientId: string;
  listingId?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const convId = await getOrCreateConversation(recipientId, listingId);
      router.push(`/messages/${convId}`);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={
        className ??
        "rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors disabled:opacity-50"
      }
    >
      {loading ? "Opening…" : label}
    </button>
  );
}
