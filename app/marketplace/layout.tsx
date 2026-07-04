import { PublicNav } from "@/components/PublicNav";

// Static shell — auth is resolved client-side in PublicNav so this subtree isn't
// forced dynamic, letting marketplace pages be cached/ISR for crawlers.
export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <PublicNav />
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
