"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { InstallAppButton } from "@/components/InstallAppButton";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Inventory", href: "/inventory" },
  { label: "Master Sets", href: "/masterset" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Cards", href: "/card-data" },
  { label: "Community", href: "/community" },
  { label: "Offers",   href: "/offers" },
];

export function MobileMenu({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative min-[1200px]:hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Toggle navigation menu"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground-muted hover:text-gold hover:bg-gold/5 transition-colors"
      >
        {open ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-border bg-surface shadow-xl shadow-black/40 overflow-hidden z-50">
          <nav className="flex flex-col p-2">
            {navLinks.map(({ label, href }) => {
              const active =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "bg-gold/10 text-gold"
                      : "text-foreground-muted hover:text-foreground hover:bg-surface-raised"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border p-2 flex flex-col">
            <Link
              href={`/profile/${username}`}
              className="px-3 py-2 rounded-md text-sm text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
            >
              My Profile
            </Link>
            <Link
              href="/wishlist"
              className="px-3 py-2 rounded-md text-sm text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
            >
              My Wishlist
            </Link>
            <Link
              href="/transactions"
              className="px-3 py-2 rounded-md text-sm text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
            >
              Transactions
            </Link>
            <Link
              href="/reveals"
              className="px-3 py-2 rounded-md text-sm text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
            >
              Pack Reveals
            </Link>
            <Link
              href="/support"
              className="px-3 py-2 rounded-md text-sm text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
            >
              Support Vaultset
            </Link>
            <Link
              href="/account"
              className="px-3 py-2 rounded-md text-sm text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
            >
              Settings
            </Link>
            <div className="px-3 py-2">
              <InstallAppButton variant="inline" />
            </div>
            <button
              onClick={signOut}
              className="px-3 py-2 rounded-md text-sm text-left text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
