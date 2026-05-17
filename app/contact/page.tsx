import Link from "next/link";

export const metadata = { title: "Contact — Vaultset" };

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">

      {/* Nav */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-widest text-gold hover:text-gold-light transition-colors">
            VAULTSET
          </Link>
          <Link href="/" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
            ← Back to home
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="max-w-xl">
          <h1 className="text-3xl font-bold text-foreground">Contact</h1>
          <p className="mt-2 text-foreground-muted leading-relaxed">
            Have a question, found a bug, or want to share feedback? We'd love to hear from you.
          </p>

          <div className="mt-10 space-y-6">

            <div className="rounded-2xl border border-border bg-surface p-6 space-y-2">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">General Inquiries</h2>
              <p className="text-sm text-foreground-muted">
                For questions about the platform, your account, or anything else:
              </p>
              <a
                target="_blank" rel="noopener noreferrer" href="mailto:hello@vaultset.app"
                className="text-gold hover:text-gold-light transition-colors text-sm font-medium"
              >
                hello@vaultset.app
              </a>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-6 space-y-2">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Privacy & Data Requests</h2>
              <p className="text-sm text-foreground-muted">
                To request account deletion, a data export, or to report a privacy concern:
              </p>
              <a
                target="_blank" rel="noopener noreferrer" href="mailto:privacy@vaultset.app"
                className="text-gold hover:text-gold-light transition-colors text-sm font-medium"
              >
                privacy@vaultset.app
              </a>
              <p className="text-xs text-foreground-muted mt-1">
                You can also delete your account directly from{" "}
                <Link href="/account" className="text-gold hover:text-gold-light transition-colors">
                  Account Settings
                </Link>.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-6 space-y-2">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Bug Reports & Feedback</h2>
              <p className="text-sm text-foreground-muted">
                Found something broken or have a feature suggestion? We genuinely appreciate
                bug reports and collector feedback — it directly shapes what we build next.
              </p>
              <a
                target="_blank" rel="noopener noreferrer" href="mailto:feedback@vaultset.app"
                className="text-gold hover:text-gold-light transition-colors text-sm font-medium"
              >
                feedback@vaultset.app
              </a>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-6 space-y-2">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Response Time</h2>
              <p className="text-sm text-foreground-muted">
                We aim to respond to all inquiries within 2–3 business days. During peak periods
                it may take a bit longer — we appreciate your patience.
              </p>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-6 flex items-center justify-between text-sm text-foreground-muted">
          <span>© 2026 Vaultset. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
