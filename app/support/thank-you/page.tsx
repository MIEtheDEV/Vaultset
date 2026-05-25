import Link from "next/link";

export const metadata = { title: "Thank You — Vaultset" };

export default function ThankYouPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">

      {/* Nav */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-widest text-gold hover:text-gold-light transition-colors">
            VAULTSET
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-gold mx-auto">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Thank you!</h1>
            <p className="text-foreground-muted leading-relaxed">
              Your support means a lot. It goes directly toward keeping Vaultset free and
              improving the platform for every collector.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard"
              className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
            >
              Back to Dashboard
            </Link>
            <Link
              href="/"
              className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-foreground hover:border-gold/40 hover:bg-surface transition-colors"
            >
              Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
