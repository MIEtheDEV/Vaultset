"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function UserNav({ username, showSettings = true }: { username: string; showSettings?: boolean }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/profile/${username}`}
        className="rounded-full border border-gold/20 bg-gold/5 px-3 py-1.5 text-sm font-medium text-gold hover:border-gold/40 hover:bg-gold/10 transition-colors"
      >
        @{username}
      </Link>
      {showSettings && (
        <>
          <Link
            href="/account"
            className="hidden md:block text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            Settings
          </Link>
        </>
      )}
      <button
        onClick={signOut}
        className="hidden md:block text-sm text-foreground-muted hover:text-foreground transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
