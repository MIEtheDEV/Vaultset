import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { AppNav } from "@/components/AppNav";

export default async function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const username = user?.user_metadata?.username as string | undefined;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {username ? (
        <AppNav username={username} />
      ) : (
        <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between gap-8">
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              <img src="/img/icon.png" alt="Vaultset" width={28} height={28} />
              <span className="hidden md:block text-lg font-bold tracking-widest text-gold group-hover:text-gold-light transition-colors">
                VAULTSET
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
                Sign in
              </Link>
              <Link href="/register" className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold-light transition-colors">
                Start for Free
              </Link>
            </div>
          </div>
        </nav>
      )}
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
