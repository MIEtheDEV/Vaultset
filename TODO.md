# Vaultset Feature Todo

## Monetization Strategy

**Current overhead: ~$0 (free tiers). Revenue priority reflects this.**

| Stream | When | Notes |
|---|---|---|
| Donation button | Now — ship immediately | Near-zero effort, builds community goodwill |
| Marketplace transaction fee (2–3%) | When offer/transaction system ships | Scales with GMV, no subscription infrastructure needed |
| Pro subscription (~$4.99/mo) | After Tier 2 features exist | Don't sell it before the features that justify it are built |
| Freemium limits (inventory cap, listing cap) | Only if scale demands it | Don't restrict free users until infrastructure costs force it |
| Singleton purchases (e.g. bulk import unlock) | Opportunistic, alongside Tier 4 | One-time unlock for one-time needs |

---

## Tier 1 — Complete the Core Loop

- [ ] **Donation button** — "Help keep Vaultset free" with suggested amounts ($3 / $5 / $10 / custom); Stripe Payment Link or Ko-fi; small "Supporter" badge on profile as thank-you; no recurring commitment
- [ ] **Offer system** — Let buyers send offers on listings; sellers accept/reject; payment handled off-platform initially
  - [ ] **Transaction fee hook** — When offer is accepted, record a 2–3% platform fee against the sale; enforce/collect once payment infra exists
- [ ] **Public user profiles** — Public-facing profile page per user; trust signal for marketplace + prerequisite for social features; dashboard "View Profile" button is disabled
- [ ] **Transaction history** — Record of completed deals for both buyer and seller; required for fee auditing
- [ ] **Card wishlist** — Cards the user wants to acquire; prerequisite for trade matching
- [ ] **Trade matching** — Match users based on wishlists and for-trade inventory; "Start a Trade" on dashboard is disabled, no routes or components exist

---

## Tier 2 — Retention & Engagement

*These features justify the Pro subscription — build them before selling it.*

- [ ] **Price alerts** — Notify users when market price crosses a threshold; **Pro feature**
- [ ] **Price history charts** — Graph market_price over time per card; **Pro feature** (storing historical data has real infra cost)
- [ ] **Portfolio analytics** — Total collection value over time, ROI tracking; **Pro feature**
- [ ] **Pull reveals** — Let users publicly log and share what they pulled; free to read, **Pro to publish**
- [ ] **Custom SMTP** — Supabase default has a 2 emails/hour rate limit on password resets (noted as TODO in code)

---

## Tier 2.5 — Launch Pro Subscription

*Only build this after Tier 2 features exist. Selling a subscription before the features are there destroys trust.*

- [ ] **Stripe integration** — Subscription billing, webhook handling, customer portal
- [ ] **Pro plan enforcement** — Gate Tier 2 features behind subscription check; existing users grandfathered free
- [ ] **Pricing page** — Clear free vs. Pro comparison; highlight price alerts, analytics, unlimited inventory
- [ ] **Upgrade prompts** — Contextual upsell nudges at feature limits (e.g., "Upgrade to Pro for price alerts")
- [ ] **Freemium limits** — Enforce free-tier caps only once scale demands it: ~500 card inventory limit, ~10 active listings

---

## Tier 3 — Community Growth

- [ ] **Follows & feeds** — Follow collectors, activity feed of their listings/pulls
- [ ] **Collection showcase** — Curated public collection views per user; **Pro feature** (advanced customization)
- [ ] **Achievement badges** — Milestone rewards (e.g., 100 cards added, first sale); Supporter badge for donors
- [ ] **Community pricing stats** — "More Stats Coming Soon" on community page

---

## Tier 4 — Scale & DX

- [ ] **Bulk import** — CSV or spreadsheet upload for migrating existing collections; **singleton purchase ($2.99)** for free users, included in Pro
- [ ] **Bulk edit** — Select multiple cards and update condition/price/listing flags at once
- [ ] **Shipping integration** — Label generation or shipping cost estimation; required before collecting transaction fees
- [ ] **OAuth login** — Google/Discord social sign-in via Supabase
- [ ] **2FA** — Optional TOTP for account security
- [ ] **Email change verification** — Confirm new email before swapping (account settings form exists, verify flow may be missing)
- [ ] **Database migrations** — Schema currently managed manually in Supabase UI; add migration files to repo
- [ ] **E2E test coverage** — Auth tests configured; inventory, marketplace, and market refresh flows not yet covered
- [ ] **Rate limit feedback** — Market refresh rate limit is shown but other rate limits have no UI feedback
- [ ] **Multi-game support** — Architecture (polymorphic providers) is ready; MTG, One Piece, Lorcana, etc. need search provider + rarity system implementations

---

## Marketplace Enhancements (post-transaction)

- [ ] **Listing expiry** — Auto-delist after a set time period
- [ ] **Duplicate management** — Currently warns on duplicate; add a "merge quantities" action

---

## Free vs. Pro Reference

| Feature | Free | Pro |
|---|---|---|
| Card inventory | Up to 500 cards | Unlimited |
| Active marketplace listings | Up to 10 | Unlimited |
| Market price refresh | 1/day | Multiple/day |
| Watchlist | Yes | Yes |
| Dashboard & basic stats | Yes | Yes |
| Community & storefronts | Yes | Yes |
| Price alerts | — | Yes |
| Price history charts | — | Yes |
| Portfolio analytics (ROI) | — | Yes |
| Pull reveal publishing | — | Yes |
| Collection showcase | — | Yes (advanced) |
| Bulk import | Singleton purchase | Included |
| Supporter badge | Donors only | — |
