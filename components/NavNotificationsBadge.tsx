"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export function NavNotificationsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function fetchUnread(userId: string) {
      const { count: unread } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false);
      setCount(unread ?? 0);
    }

    function setupForUser(userId: string) {
      fetchUnread(userId);
      if (channel) supabase.removeChannel(channel);
      channel = supabase
        .channel(`nav-notifications-badge-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => fetchUnread(userId))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => fetchUnread(userId))
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
