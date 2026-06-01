import Link from "next/link";
import { KofiButton } from "@/components/KofiButton";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-lg font-bold tracking-widest text-gold">VAULTSET</span>
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
