import Link from "next/link";
import { UserNav } from "@/components/UserNav";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Inventory", href: "/inventory" },
  { label: "Marketplace", href: "/marketplace" },
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

        <div className="hidden md:flex items-center gap-6 text-sm text-foreground-muted">
          {navLinks.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="hover:text-foreground transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>

        <UserNav username={username} />
      </div>
    </nav>
  );
}
