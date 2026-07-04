"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

// Marketing nav links — mirrors the desktop set in the homepage navbar.
// `authOnly` links require an account, so they're shown only to signed-in users.
const LINKS: { href: string; label: string; authOnly?: boolean }[] = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features",     label: "Features" },
  { href: "#card-search",  label: "Card Search" },
  { href: "/marketplace",  label: "Marketplace", authOnly: true },
  { href: "/community",    label: "Community",   authOnly: true },
  { href: "/pricing",      label: "Pricing" },
];

/**
 * Hamburger menu for the homepage navbar, shown only below 900px (the desktop
 * link row is `hidden min-[1200px]:flex`; this is `min-[1200px]:hidden`). When the
 * visitor is signed in, it also carries Sign out — which the main-nav `UserNav`
 * hides below 900px to avoid duplication.
 */
export function HomeMobileNav({ loggedIn = false }: { loggedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function signOut() {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative min-[1200px]:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-muted hover:bg-surface-raised hover:text-foreground transition-colors"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Tap-outside to close */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
            {LINKS.filter((l) => !(l.authOnly && !loggedIn)).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm text-foreground-muted hover:bg-surface-raised hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            ))}
            {loggedIn && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={signOut}
                  className="block w-full px-4 py-2.5 text-left text-sm text-foreground-muted hover:bg-surface-raised hover:text-foreground transition-colors"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
