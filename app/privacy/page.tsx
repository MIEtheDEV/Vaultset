import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Vaultset",
  description: "Read the Vaultset Privacy Policy to understand how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
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
      <main className="mx-auto max-w-4xl px-6 py-16 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-foreground-muted">Last updated: May 2026</p>
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
            </ul>
            <p>
              We do not collect payment information, physical addresses, or any data beyond what is
              necessary to operate the platform.
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
            <h2 className="text-lg font-semibold text-foreground">5. Data Storage & Security</h2>
            <p>
              Your data is stored securely using Supabase, a cloud database platform with
              row-level security enforced at the database level. Passwords are never stored in
              plain text. We take reasonable precautions to protect your information, but no
              system is completely immune to security risks.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. Data Retention & Deletion</h2>
            <p>
              You may delete your account at any time through the Account Settings page. Upon
              deletion, your personal information and collection data are permanently removed.
              Some anonymized aggregate data (such as total card counts used in platform statistics)
              may be retained.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">7. Third-Party Services</h2>
            <p>Vaultset uses the following third-party services to operate:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-foreground font-medium">Supabase</span> — database and authentication.</li>
              <li><span className="text-foreground font-medium">Pokémon TCG API</span> — card data and imagery. No personal information is shared with this service.</li>
              <li><span className="text-foreground font-medium">Vercel</span> — hosting and deployment.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">8. Contact</h2>
            <p>
              If you have questions or concerns about your privacy, please reach out through our{" "}
              <Link href="/contact" className="text-gold hover:text-gold-light transition-colors">
                contact page
              </Link>.
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-6 flex items-center justify-between text-sm text-foreground-muted">
          <span>© 2026 Vaultset. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
