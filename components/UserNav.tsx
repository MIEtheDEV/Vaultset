"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function UserNav({
  username,
  showSettings = true,
  signOutInMenu = false,
  usernameHref,
}: {
  username: string;
  showSettings?: boolean;
  /** When true, hide the inline Sign out below 900px — the hamburger menu provides it there. */
  signOutInMenu?: boolean;
  /** Where the @username pill links (defaults to the public profile). */
  usernameHref?: string;
}) {
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
        href={usernameHref ?? `/profile/${username}`}
        className="rounded-full border border-gold/20 bg-gold/5 px-3 py-1.5 text-sm font-medium text-gold hover:border-gold/40 hover:bg-gold/10 transition-colors"
      >
        @{username}
      </Link>
      {showSettings && (
        <>
          <Link
            href="/account"
            className="hidden min-[1200px]:block text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            Settings
          </Link>
        </>
      )}
      <button
        onClick={signOut}
        className={`text-sm text-foreground-muted hover:text-foreground transition-colors whitespace-nowrap ${
          signOutInMenu ? "hidden min-[1200px]:block" : ""
        }`}
      >
        Sign out
      </button>
    </div>
  );
}
