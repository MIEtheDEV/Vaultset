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

## Build Phases

### Phase 1

- [x] **Transaction history** — Dedicated `/transactions` page showing completed deals split by sold/bought with summary stats. Linked from offers page and mobile menu.
- [x] **Pull reveals** — `/reveals` community feed + `/reveals/log` page with card search, caption, visibility toggle. "Log Reveal" button added to each product purchase. DB migration at `supabase/migrations/20260601000000_add_pack_reveals_table.sql`. *Free until Pro gating in Phase 4.*
- [x] **Bulk import** — `/inventory/import` page with drag-and-drop CSV upload, column mapping, preview table, and progress bar. `papaparse` added as dependency. Import button added to inventory header.
- [x] **Bulk edit** — Select mode in `InventoryGrid` with per-card checkboxes, select all/deselect all, and sticky batch action bar (list for sale, mark for trade, delete with confirmation).
- [x] **OAuth login** — `OAuthButtons` component (Google + Discord) added to login and register pages. Auth callback redirects OAuth users without a username to `/auth/setup` to pick a username. Google and Discord providers configured and verified working in Supabase.
- [x] **Email change verification** — Pending email banner in account settings shows when `user.new_email` is set, with a resend confirmation button.
- [x] **Rate limit feedback** — Offer rate limit now shows a distinct amber banner with a link to `/offers` instead of a generic red error.
- [x] **Duplicate card merging** — Duplicate warning now fetches and displays existing copies (condition, grade, quantity) with direct links to each inventory item.
- [x] **Database migrations** — `supabase/migrations/` directory created with setup README. `CLAUDE.md` updated. New features write SQL migration files here going forward.

### Phase 2

- [ ] **Price history charts** — Graph `market_price` over time per card; **Pro feature**. *No time-series data is stored yet — requires a new table and a scheduled job to snapshot prices daily. Must ship before portfolio analytics.*
- [ ] **Portfolio analytics** — Total collection value over time, ROI tracking; **Pro feature**. *Depends on price history data from above.*
- [ ] **Collection showcase** — Curated public collection views per user; **Pro feature** (advanced customization). *Profiles show a basic card tab but no curated/showcase layout.*
- [ ] **Achievement badges** — Milestone rewards (e.g., 100 cards added, first sale). *Supporter badge for donors exists; milestone badges do not.*
- [ ] **Community pricing stats** — "More Stats Coming Soon" placeholder on community page. *Top-10 leaderboard and aggregate stats exist; per-set or per-card community pricing is not implemented.*

### Phase 3

- [ ] **Stripe integration** — Subscription billing, webhook handling, customer portal. *No Stripe dependency exists in the project yet.*
- [ ] **Transaction fee hook** — When offer is accepted, record a 2–3% platform fee against the sale; enforce/collect once Stripe is in place. *Offers table currently has no `fee` column; payment is arranged off-platform.*

### Phase 4

- [ ] **Pro plan enforcement** — Gate Pro features (price history, portfolio analytics, collection showcase, pull reveal publishing) behind subscription check; existing users grandfathered free.
- [ ] **Pricing page** — Clear free vs. Pro comparison; highlight price alerts, analytics, unlimited inventory.
- [ ] **Upgrade prompts** — Contextual upsell nudges at feature limits (e.g., "Upgrade to Pro for price alerts").
- [ ] **Freemium limits** — Enforce free-tier caps: ~500 card inventory limit, ~10 active listings. *No cap enforcement exists in the codebase today.*
- [ ] **2FA** — Optional TOTP for account security.
- [ ] **Error monitoring** — No error tracking service (e.g. Sentry) is integrated. *Uncaught client and server errors are currently invisible.*

### Phase 5

- [ ] **Shipping integration** — Label generation or shipping cost estimation; required before collecting transaction fees on shipped orders.
- [ ] **Multi-game support** — Polymorphic `CardSearchProvider` and `RaritySystem` architecture is complete; only Pokémon TCG is implemented. To add a new game: implement the two abstract classes in `lib/search/` and `lib/rarity/`, then register in their respective `index.ts` factories.

---

## Completed

- [x] **Homepage overhaul** — Rotating headline, How It Works section, comparison table, FAQ with `FAQPage` JSON-LD schema, collector reviews system (submission, admin approval queue, star bar, `/reviews` landing page), review prompt on dashboard at 10+ cards, admin notifications on review submit/edit.
- [x] **Donation button** — Ko-fi + PayPal + Stripe payment links on `/support`; Supporter badge displayed on profiles for Ko-fi donors
- [x] **Offer system** — Buyers send cash/trade/bundle offers; sellers accept/reject/counter; full lifecycle (pending → accepted → completed) with 7-day auto-expiry, inventory holds, both-party receipt confirmation, and offer history
- [x] **Public user profiles** — Public profile at `/profile/[username]` with avatar, bio, specialty, city, followers, featured card, and tabbed listings/collection/wishlist views
- [x] **Card wishlist** — Cards the user wants to acquire with optional notes and price targets
- [x] **Trade matching** — Dashboard "Available Now" shows wishlist cards currently for sale; "Trade Matches" shows wishlist cards for trade
- [x] **Price alerts** — Notifies users when a matching listing drops to or below their wishlist target price; notification created automatically when a new listing matches a wishlist entry
- [x] **Custom SMTP** — Transactional email provider configured; password reset rate limit resolved
- [x] **Follows & feeds** — Follow collectors; follower/following lists with counts; mutual-follower labels; following feed on dashboard; marketplace filter to show only followed sellers; account setting to restrict offers to followers only

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
| Price alerts | Yes | Yes |
| Price history charts | — | Yes |
| Portfolio analytics (ROI) | — | Yes |
| Pull reveal publishing | — | Yes |
| Collection showcase | — | Yes (advanced) |
| Bulk import | Singleton purchase | Included |
| Supporter badge | Donors only | — |
