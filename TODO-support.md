# Support & Donations Todo

## Payment Platform Setup (Do on Your End)

- [ ] **Ko-fi** — Update button color from `#72a4f2` to match gold design system in Ko-fi page settings
- [ ] **PayPal Business** — Create account, verify identity + bank (1–3 days), get paypal.me link
- [ ] **Stripe** — Create account, verify identity + bank (1–2 days), create a Payment Link with suggested amounts ($3 / $5 / $10 / custom)
- [ ] **Venmo Business** — Create business account (not personal — TOS), claim venmo.me handle
- [ ] **CashApp Business** — Create business account, claim $cashtag

## Site Integration

- [ ] **`/support` page** — Dedicated page listing all donation options (Ko-fi, PayPal, Venmo, CashApp, Stripe); include the platform bio and a "not tax-deductible" disclaimer
- [ ] **Additional payment links** — Add PayPal, Venmo, and CashApp links to the `/support` page once accounts are set up
- [ ] **Stripe Payment Link** — Embed a Stripe donate button on `/support` for users who want to pay by card without leaving the site
- [ ] **Footer link** — Add "Support" link to the homepage footer nav alongside Privacy / Terms / Contact
- [ ] **Mobile menu** — Add "Support" link to the mobile nav

## Supporter Recognition

- [ ] **Supporter badge** — Small badge on user profiles for donors (Ko-fi webhook or manual flag in DB)
- [ ] **`is_supporter` flag** — Add column to `profiles` table; set via webhook or admin toggle
- [ ] **Ko-fi webhook** — Wire up Ko-fi's webhook to automatically set `is_supporter = true` on donation (requires a `/api/kofi-webhook` route + secret verification)
- [ ] **Thank-you page** — `/support/thank-you` redirect destination after a successful Ko-fi donation
