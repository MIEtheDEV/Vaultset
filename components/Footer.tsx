import Link from "next/link";
import { KofiButton } from "@/components/KofiButton";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      {/* Discover — internal links to public SEO hubs, reachable from every page */}
      <div className="mx-auto max-w-7xl px-6 pt-8">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground-muted">
          <span className="font-medium text-foreground">Discover</span>
          <Link href="/card-data" className="hover:text-foreground transition-colors">Card Search</Link>
          <Link href="/sets" className="hover:text-foreground transition-colors">Sets</Link>
          <Link href="/most-valuable-pokemon-cards" className="hover:text-foreground transition-colors">Most Valuable Cards</Link>
          <Link href="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
          <Link href="/community" className="hover:text-foreground transition-colors">Community</Link>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src="/img/icon.png" alt="Vaultset" width={28} height={28} />
          <span className="hidden md:block text-lg font-bold tracking-widest text-gold">VAULTSET</span>
        </div>
        <KofiButton />
        <div className="flex gap-6 text-sm text-foreground-muted">
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
        </div>
      </div>
    </footer>
  );
}
