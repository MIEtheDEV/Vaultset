"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { AppNav } from "@/components/AppNav";

// Nav for public/crawlable pages. Resolves auth in the browser (like the existing
// nav badges + UserNav) instead of the server layout, so the page subtree is NOT
// forced dynamic by cookies() — letting public pages be static/ISR. SSR and first
// client paint render the logged-out nav (what crawlers should see); once auth
// resolves, signed-in visitors get the full AppNav.
export function PublicNav() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUsername((data.user?.user_metadata?.username as string) ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsername((session?.user?.user_metadata?.username as string) ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (username) return <AppNav username={username} />;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between gap-8">
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <img src="/img/icon.png" alt="Vaultset" width={28} height={28} />
          <span className="hidden md:block text-lg font-bold tracking-widest text-gold group-hover:text-gold-light transition-colors">
            VAULTSET
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
            Sign in
          </Link>
          <Link href="/register" className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold-light transition-colors">
            Start for Free
          </Link>
        </div>
      </div>
    </nav>
  );
}
