import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Vaultset",
  alternates: { canonical: "/privacy" },
  description: "Read the Vaultset Privacy Policy to understand how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
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
      <main className="mx-auto max-w-4xl px-6 py-16 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-foreground-muted">Last updated: June 2026</p>
        </div>

        <div className="prose-custom space-y-8 text-foreground-muted leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Who We Are</h2>
            <p>
              Vaultset is a trading card collection and marketplace platform. We help collectors
              manage their inventory, track market values, and connect with other collectors.
              This Privacy Policy explains what information we collect, how we use it, and your rights
              regarding that information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. Information We Collect</h2>
            <p>We collect the following information when you use Vaultset:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-foreground font-medium">Account information</span> — your email address, username, and password (stored securely and hashed).</li>
              <li><span className="text-foreground font-medium">Collection data</span> — card records you add to your inventory, including condition, grade, pricing, and personal notes.</li>
              <li><span className="text-foreground font-medium">Usage data</span> — basic session and authentication data required to keep you logged in.</li>
              <li><span className="text-foreground font-medium">Subscription data</span> — your billing status and a Stripe customer identifier if you upgrade to a paid plan. Your payment card details are handled by Stripe and are never stored by Vaultset (see Section 8).</li>
            </ul>
            <p>
              Payments for paid subscriptions are processed by Stripe; we never see or store your full
              card details (see Section 8). We do not collect physical addresses or any data beyond what
              is necessary to operate the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. How We Use Your Information</h2>
            <p>Your information is used to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Create and maintain your account.</li>
              <li>Display your collection and listings to you and, where applicable, to other users.</li>
              <li>Provide core platform features such as inventory management and marketplace browsing.</li>
              <li>Communicate with you regarding your account if necessary.</li>
            </ul>
            <p>
              We do not sell, rent, or share your personal information with third parties for marketing purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Public Information</h2>
            <p>
              When you list a card for sale or trade, certain information becomes visible to other
              registered users — including the card details, condition, grade, and asking price.
              Your username is associated with your public listings. Cards you keep private
              (not listed for sale or trade) are visible only to you.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Cookies &amp; Analytics</h2>
            <p>
              We use a small number of{" "}
              <span className="text-foreground font-medium">strictly necessary cookies</span> to keep you
              signed in and to secure your session. These are set by Supabase, our authentication
              provider, and are required for the platform to function — you cannot log in without them.
            </p>
            <p>
              To understand how the platform is used, we rely on{" "}
              <span className="text-foreground font-medium">privacy-friendly, cookieless analytics</span>{" "}
              from Vercel (Web Analytics and Speed Insights). These tools measure aggregate traffic and
              performance without using cookies, without storing a persistent identifier, and without
              tracking you across other websites.
            </p>
            <p>
              We do not use advertising, marketing, or cross-site tracking cookies. Because the only
              cookies we set are essential to providing the service you request, no cookie consent
              banner is required.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. Data Storage &amp; Security</h2>
            <p>
              Your data is stored securely using Supabase, a cloud database platform with
              row-level security enforced at the database level. Passwords are never stored in
              plain text. We take reasonable precautions to protect your information, but no
              system is completely immune to security risks.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">7. Data Retention &amp; Deletion</h2>
            <p>
              You may delete your account at any time through the Account Settings page. Upon
              deletion, your personal information and collection data are permanently removed.
              Some anonymized aggregate data (such as total card counts used in platform statistics)
              may be retained.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">8. Third-Party Services</h2>
            <p>Vaultset uses the following third-party services to operate:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-foreground font-medium">Supabase</span> — database and authentication.</li>
              <li><span className="text-foreground font-medium">Stripe</span> — payment processing for paid subscriptions and optional donations. When you subscribe or make a donation, your email address and a user identifier are shared with Stripe so it can process the payment and, for donations, credit your Supporter status. Your full payment card details are entered on Stripe&apos;s own secure checkout and are never seen or stored by Vaultset.</li>
              <li><span className="text-foreground font-medium">Vercel</span> — hosting, deployment, and privacy-friendly, cookieless analytics (see Section 5).</li>
              <li><span className="text-foreground font-medium">Pokémon TCG API</span> — card data and imagery. No personal information is shared with this service.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">9. Contact</h2>
            <p>
              If you have questions or concerns about your privacy, please reach out through our{" "}
              <Link href="/contact" className="text-gold hover:text-gold-light transition-colors">
                contact page
              </Link>.
            </p>
          </section>

        </div>
      </main>
    </div>
  );
}
