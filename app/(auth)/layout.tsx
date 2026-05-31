import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s — Vaultset",
    default: "Vaultset",
  },
  robots: { index: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background flex flex-col">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(232,184,75,0.05) 0%, transparent 60%)" }}
      />

      <header className="relative z-10 flex justify-center pt-10">
        <Link
          href="/"
          className="text-2xl font-bold tracking-widest text-gold hover:text-gold-light transition-colors"
        >
          VAULTSET
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        {children}
      </main>

      <footer className="relative z-10 pb-8 text-center">
        <p className="text-xs text-foreground-muted">
          By continuing, you agree to our{" "}
          <Link href="#" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="#" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </p>
      </footer>
    </div>
  );
}
