import Link from "next/link";

export const metadata = {
  title: "Support Vaultset — Help Keep it Free",
  description: "Vaultset is free to use and will stay that way. If it's been useful to you, a small contribution helps keep the servers running.",
};

const KOFI_URL = "https://ko-fi.com/J5M22056SF";
const PAYPAL_URL = "https://www.paypal.com/ncp/payment/MYREWM84YUCC2";
const STRIPE_URL = "https://donate.stripe.com/test_7sY4gs4hH2sU0Mn8ir1Nu01";

const methods = [
  {
    name: "Ko-fi",
    description: "Quick one-time contributions. No account required — pay with any card via Ko-fi.",
    cta: "Support on Ko-fi",
    url: KOFI_URL,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    name: "PayPal",
    description: "Pay with your PayPal balance, bank account, or any debit or credit card.",
    cta: "Donate via PayPal",
    url: PAYPAL_URL,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    name: "Card",
    description: "Donate by debit or credit card directly — powered by Stripe. Secure checkout.",
    cta: "Donate by Card",
    url: STRIPE_URL,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M6 15h2M10 15h4" />
      </svg>
    ),
  },
];

export default function SupportPage() {
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
          <h1 className="text-3xl font-bold text-foreground">Help keep Vaultset free</h1>
          <p className="mt-3 text-foreground-muted leading-relaxed">
            Vaultset is free to use and will stay that way. If it&apos;s saved you time or helped
            you manage your collection, a small contribution helps cover hosting, TCGPlayer API
            access, and ongoing development.
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            No recurring commitment. Every amount helps.
          </p>

          <div className="mt-10 space-y-4">
            {methods.map(({ name, description, cta, url, icon }) => (
              <div key={name} className="rounded-2xl border border-border bg-surface p-6 flex items-start gap-4">
                <div className="shrink-0 mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold">
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-foreground">{name}</h2>
                  <p className="mt-1 text-sm text-foreground-muted leading-relaxed">{description}</p>
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 self-center rounded-full border border-gold/30 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10 hover:border-gold/50 transition-colors"
                >
                  {cta}
                </a>
              </div>
            ))}
          </div>

          <p className="mt-8 text-xs text-foreground-muted">
            Contributions to Vaultset are not tax-deductible. You will receive a Supporter badge
            on your profile as a thank-you for Ko-fi donations.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-6 flex items-center justify-between text-sm text-foreground-muted">
          <span>© 2026 Vaultset. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
