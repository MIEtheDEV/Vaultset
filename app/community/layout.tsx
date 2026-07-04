import { PublicNav } from "@/components/PublicNav";

// Ungated + static: /community reads only public data, so crawlers must be able
// to render it. Auth is resolved client-side in PublicNav.
export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <PublicNav />
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
