import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Vaultset",
  description: "Read the Vaultset Terms of Service governing your use of the platform.",
};

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
          <p className="mt-2 text-sm text-foreground-muted">Last updated: May 2026</p>
        </div>

        <div className="space-y-8 text-foreground-muted leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using the Vaultset platform, you agree to these Terms of
              Service. If you do not agree, please do not use the platform. We reserve the right
              to update these terms at any time. Continued use of the platform after changes are
              posted constitutes acceptance of the revised terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. Your Account</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials.
              You must provide accurate information when registering and keep it up to date.
              You may not create accounts for others without their consent, impersonate another
              person, or use a username that is offensive or misleading.
            </p>
            <p>
              You are responsible for all activity that occurs under your account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">3. Acceptable Use</h2>
            <p>You agree not to use Vaultset to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Post false, misleading, or fraudulent card listings.</li>
              <li>Misrepresent the condition, grade, or authenticity of a card.</li>
              <li>Harass, threaten, or harm other users.</li>
              <li>Attempt to gain unauthorized access to other accounts or platform systems.</li>
              <li>Use automated bots or scrapers to extract data from the platform.</li>
              <li>Engage in any activity that violates applicable laws or regulations.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. User-Generated Content</h2>
            <p>
              You retain ownership of the content you create on Vaultset, including your card
              listings and collection data. By posting content, you grant Vaultset a non-exclusive
              license to display that content to other users as part of the platform's normal operation.
            </p>
            <p>
              You are solely responsible for the accuracy of your listings. Vaultset does not
              verify the condition, authenticity, or grading of any card listed on the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Marketplace & Transactions</h2>
            <p>
              Vaultset provides tools to connect buyers, sellers, and traders. However, Vaultset
              is not a party to any transaction between users and assumes no liability for
              disputes, failed transactions, misrepresented items, or any harm resulting from
              a transaction arranged through the platform.
            </p>
            <p>
              Transaction functionality is currently limited and under active development.
              Always exercise your own judgment when engaging with other users.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">6. Intellectual Property</h2>
            <p>
              Pokémon and all related names, characters, and imagery are trademarks of Nintendo,
              Game Freak, and Creatures Inc. Vaultset is not affiliated with, endorsed by, or
              sponsored by these companies. Card images displayed on the platform are sourced
              from the Pokémon TCG API and used for informational and organizational purposes only.
            </p>
            <p>
              The Vaultset name, logo, and platform design are the property of Vaultset.
              You may not reproduce or use these without permission.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">7. Disclaimer of Warranties</h2>
            <p>
              Vaultset is provided "as is" without warranties of any kind. We do not guarantee
              that the platform will be error-free, uninterrupted, or free of security vulnerabilities.
              Market pricing data and valuations displayed on the platform are for reference only
              and do not constitute financial advice.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Vaultset shall not be liable
              for any indirect, incidental, special, or consequential damages arising from your
              use of the platform, including but not limited to loss of data, failed transactions,
              or any harm resulting from interactions with other users.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">9. Termination</h2>
            <p>
              We reserve the right to suspend or terminate accounts that violate these terms,
              engage in fraudulent activity, or otherwise harm the platform or its users.
              You may also delete your account at any time through Account Settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">10. Contact</h2>
            <p>
              Questions about these terms? Reach us through our{" "}
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
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
