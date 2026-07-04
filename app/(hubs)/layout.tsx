import { PublicNav } from "@/components/PublicNav";

// Static shell for all public SEO hubs (/sets, /rarity, /pokemon, most-valuable).
// Auth resolves client-side in PublicNav so these routes stay static/ISR.
export default function HubsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <PublicNav />
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
