import { PublicNav } from "@/components/PublicNav";

// Static shell — auth resolved client-side in PublicNav so card-data pages can be
// cached/ISR for crawlers.
export default function CardDataLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <PublicNav />
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
