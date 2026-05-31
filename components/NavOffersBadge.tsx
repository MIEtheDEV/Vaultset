"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export function NavOffersBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function fetchPending(userId: string) {
      const { count: pending } = await supabase
        .from("offers")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("status", "pending");

      setCount(pending ?? 0);
    }

    function setupForUser(userId: string) {
      fetchPending(userId);

      if (channel) supabase.removeChannel(channel);
      channel = supabase
        .channel(`nav-offers-badge-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "offers" }, () => fetchPending(userId))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "offers" }, () => fetchPending(userId))
        .subscribe();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setupForUser(session.user.id);
      } else {
        if (channel) supabase.removeChannel(channel);
        channel = null;
        setCount(0);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute -top-1 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-0.5 text-[10px] font-bold text-background pointer-events-none">
      {count > 9 ? "9+" : count}
    </span>
  );
}
