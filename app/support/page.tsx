import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { DonateCardButton } from "@/components/DonateCardButton";

export const metadata = {
  title: "Support Vaultset — Help Keep it Free",
  alternates: { canonical: "/support" },
  description: "Vaultset is free to use and will stay that way. If it's been useful to you, a small contribution helps keep the servers running.",
};

const KOFI_URL = "https://ko-fi.com/J5M22056SF";
const PAYPAL_URL = "https://www.paypal.com/ncp/payment/MYREWM84YUCC2";
const STRIPE_URL = "https://buy.stripe.com/00w3cndIQdeB9d83Al5Rm03";

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
    description: "Pay with your PayPal balance, bank account, or any debit or credit card. Venmo is also accepted via PayPal checkout.",
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
    description: "Donate by debit or credit card directly — powered by Stripe. Cash App Pay is also available at checkout.",
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

export default async function SupportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">

      {/* Nav */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/img/icon.png" alt="Vaultset" width={28} height={28} />
            <span className="text-lg font-bold tracking-widest text-gold group-hover:text-gold-light transition-colors">VAULTSET</span>
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
            Vaultset&apos;s core features are free, and always will be. If it&apos;s saved you time or
            helped you manage your collection, a small contribution helps cover hosting, card data
            access, and ongoing development. (Prefer extra features over donating? Vaultset{" "}
            <Link href="/pricing" className="text-gold hover:text-gold-light transition-colors">
              Pro
            </Link>{" "}
            is there too.)
          </p>
          <p className="mt-2 text-sm text-foreground-muted">
            No recurring commitment. Every amount helps.
          </p>

          <div className="mt-10 space-y-4">
            {methods.map(({ name, description, cta, url, icon }) => (
              <div key={name} className="rounded-2xl border border-border bg-surface p-6 flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* Icon + title — share a row on mobile; on desktop title moves into the text column */}
                <div className="flex items-center gap-4">
                  <div className="shrink-0 sm:mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold">
                    {icon}
                  </div>
                  <h2 className="font-semibold text-foreground sm:hidden">{name}</h2>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="hidden sm:block font-semibold text-foreground">{name}</h2>
                  <p className="text-sm text-foreground-muted leading-relaxed sm:mt-1">{description}</p>
                </div>
                {name === "Card" && isLoggedIn ? (
                  <DonateCardButton
                    label={cta}
                    className="rounded-full border border-gold/30 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10 hover:border-gold/50 transition-colors disabled:opacity-50"
                  />
                ) : (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 self-start sm:self-center rounded-full border border-gold/30 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10 hover:border-gold/50 transition-colors"
                  >
                    {cta}
                  </a>
                )}
              </div>
            ))}
          </div>

          <p className="mt-8 text-xs text-foreground-muted">
            Contributions to Vaultset are not tax-deductible. You&apos;ll receive a Supporter badge
            on your profile as a thank-you for Ko-fi donations and for card donations made while
            signed in.
          </p>
        </div>
      </main>
    </div>
  );
}
