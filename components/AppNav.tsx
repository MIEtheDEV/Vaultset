"use client";

import Link from "next/link";
import { UserNav } from "@/components/UserNav";
import { MobileMenu } from "@/components/MobileMenu";
import { NavMessagesBadge } from "@/components/NavMessagesBadge";
import { NavOffersBadge } from "@/components/NavOffersBadge";
import { NavNotificationsBadge } from "@/components/NavNotificationsBadge";
import { InstallAppButton } from "@/components/InstallAppButton";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Inventory", href: "/inventory" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Cards", href: "/card-data" },
  { label: "Community", href: "/community" },
];

export function AppNav({ username }: { username: string }) {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between gap-8">
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <img src="/img/icon.png" alt="Vaultset" width={28} height={28} />
          <span className="hidden md:block text-lg font-bold tracking-widest text-gold group-hover:text-gold-light transition-colors">
            VAULTSET
          </span>
        </Link>

        <div className="hidden min-[1200px]:flex items-center gap-6 text-sm text-foreground-muted">
          {navLinks.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="hover:text-foreground transition-colors"
            >
              {label}
            </Link>
          ))}
          <div className="relative">
            <Link href="/offers" className="hover:text-foreground transition-colors">
              Offers
            </Link>
            <NavOffersBadge />
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Desktop only — on mobile the install button lives in the hamburger menu. */}
          <div className="hidden min-[1200px]:block">
            <InstallAppButton />
          </div>
          <div className="relative">
            <Link
              href="/notifications"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-muted hover:text-gold hover:bg-gold/5 transition-colors"
              aria-label="Notifications"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </Link>
            <NavNotificationsBadge />
          </div>
          <div className="relative">
            <Link
              href="/messages"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-muted hover:text-gold hover:bg-gold/5 transition-colors"
              aria-label="Messages"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </Link>
            <NavMessagesBadge />
          </div>
          <Link
            href="/support"
            title="Support Vaultset"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-foreground-muted hover:text-gold hover:bg-gold/5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="sr-only">Support Vaultset</span>
          </Link>
          <UserNav username={username} signOutInMenu />
          <MobileMenu username={username} />
        </div>
      </div>
    </nav>
  );
}
