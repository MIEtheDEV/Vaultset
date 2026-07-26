# Vaultset Feature Todo

## Monetization Strategy

> **Full strategic appraisal** (positioning, competitive read, paywall-leak risk register, pricing recommendations, devil's advocate) lives in [`docs/marketing-strategy.md`](docs/marketing-strategy.md). The table below is the tactical revenue-stream view.

**Current overhead: ~$0 (free tiers). Revenue priority reflects this.**

| Stream | When | Notes |
|---|---|---|
| Donation button | Now — ship immediately | Near-zero effort, builds community goodwill |
| Marketplace transaction fee (2–3%) | When offer/transaction system ships | Scales with GMV, no subscription infrastructure needed |
| Pro subscription (~$4.99/mo) | After Tier 2 features exist | Don't sell it before the features that justify it are built |
| Singleton purchases (e.g. bulk import unlock) | Opportunistic, alongside Tier 4 | One-time unlock for one-time needs |

> **Freemium quota caps dropped (2026-06-21).** Inventory stays uncapped (the documented "gate the insight, not the storage" thesis) and the never-enforced 100-active-listing cap is abandoned — free users get unlimited listings. Charge for insight/convenience, never for participation or marketplace supply.

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
- [x] **Database schema tracking** — schema is tracked as a single committed snapshot (`supabase/schema_6-22.sql`), regenerated via `supabase db dump`. DB changes are applied in the Supabase SQL Editor, then the snapshot is refreshed. (Per-file migrations were retired.) See `CLAUDE.md`.

### Phase 2

- [x] **Price history charts** — Area chart on dashboard showing portfolio value over time with 7D/30D/90D/All range selector. `price_history` table snapshots daily via pg_cron at 02:00 UTC. Per-card chart is a future enhancement.
- [x] **Portfolio analytics** — Total collection value over time, ROI tracking; **Pro feature**. *Depends on price history data from above.*
- [x] **Collection showcase** — Curated public collection views per user; **Pro feature** (advanced customization). *Vault tab shows full card grid (up to 200); Collections tab shows curated set/rarity/custom lists. Advanced customization gated in Phase 4.*
- [x] **Achievement badges** — 50 hexagonal milestone badges across 14 categories (collection size/value, marketplace, grading, sealed products, pack reveals, transactions, social, messages, profile, reviews, ROI, longevity, multi-format). Awarded on dashboard load via `check_user_badges` RPC + `computeEarnedSlugs`. BadgeBoard dropdown on profiles with 5 user-selected featured badges. Featured badges shown inline on community page. Badge earn events in Recent Activity feed + system notifications.
- [x] **Community pricing stats** — Market Snapshot section on community page: top 5 sets by listing count with avg price, top 8 cards by listing count with price range. Section is hidden when no for-sale listings exist.

### Phase 3

- [x] **Stripe integration** — `stripe` 22.2 added. `utils/stripe.ts` client. Migration `20260611100000_add_stripe_fields.sql` adds `stripe_customer_id` + `is_pro` to profiles. API routes: `POST /api/stripe/checkout` (create checkout session), `POST /api/stripe/webhook` (sync subscription status), `POST /api/stripe/portal` (billing portal). `lib/isPro.ts` server helper for Phase 4 gates. Env vars needed: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
- [ ] **Transaction fee hook** — When offer is accepted, record a 2–3% platform fee against the sale; enforce/collect once Stripe is in place. *Offers table currently has no `fee` column; payment is arranged off-platform.* **Doubles as a Pro lever: reduced / 0% seller fees for Pro instead of gating the marketplace itself** (do NOT gate offers/trades/sales; monetize success, not access). *Collecting (vs. just recording) a fee needs Stripe Connect — bigger lift; v1 may record/display only.* **User returning to this later.**

### Phase 4

- [x] **Pricing page** — `/pricing` with 5 plan cards (Lifetime/Monthly/Quarterly/6-Month/Annual), savings % vs monthly fetched live from Stripe, Free vs Pro feature table, FAQ, nav link added to homepage.

**Pro feature build-out — build these *before* gating, in order.**

- [x] **1. Pro Seller badge on listings** — `ProSellerBadge` ("Pro Seller" pill) added to `components/ProBadge.tsx` and rendered on `MarketplaceGrid` cards, `ListingDetail`, and `SealedProductsGrid`, subscriber-gated via `isProSubscriber()`. Seller pro fields added to the marketplace + listing queries.
- [x] **2. Bulk CSV export + tax/insurance presets** — `/inventory/export` page + `components/InventoryExport.tsx` with three presets (**Full**, **Tax / cost-basis**, **Insurance inventory**), shared `lib/exportCsv.ts` (`buildCsv` + `downloadCsv`), an **Export** button in the inventory header, and a "not tax/insurance advice" disclaimer. *Cards only (`collection_items`); sealed products not included yet. Not yet Pro-gated — gating happens in the enforcement step below. PDF deferred.*
- [x] **3. Foil/holo showcase borders + public showcase display** — Discovered the public showcase didn't exist (pins were written but never rendered), so built it: a **Showcase** tab on the profile rendering pinned `profile_showcase` cards (`ProfileTabs` + profile page). Added the Pro **foil/gold animated borders** — `showcase_border` column (migration `20260613100000_add_showcase_border.sql`), a border picker in `ShowcaseEditor`, CSS rings in `globals.css`, applied on the public showcase. *Border picker is functional for all users until the enforcement step gates it. **Requires both `pro_plan` and `showcase_border` migrations applied** (see below).*
- [x] **4. Marketplace "Vacation Mode"** — Per-seller listing pause via profile flags (migration `20260614000000_add_vacation_mode.sql`). **Basic pause is free**: a `vacation_mode` toggle hides all of a seller's active listings from the marketplace + storefront and disables offers on detail pages, with amber banners everywhere (inventory untouched). **Scheduled window (`vacation_starts_at`/`ends_at`) + auto-reply message are Pro** — functional for all until enforcement. `lib/vacation.ts` `isOnVacation()` computes effective state; settings live in a new "Marketplace Availability" card in account settings.
- [x] **5. Push notifications (all types) + per-type preferences** — Full web-push stack: `web-push` dep, `push_subscriptions` table (migration `20260614100000`), service worker `public/sw.js`, `POST /api/push/subscribe` + `/api/push/unsubscribe`, `lib/push.ts` `sendPushToUser()` (prunes dead endpoints), `PushToggle` device card in account settings. **Wired for *every* notification type** via a single chokepoint (migration `20260614200000`): an AFTER INSERT trigger on `notifications` calls `POST /api/push/dispatch` through `pg_net`, catching the DB-trigger-created `new_offer`/`new_follower` as well as app-code `price_alert`/`wishlist_listing_match`/`badge_earned`. The endpoint (secret-authed via `PUSH_DISPATCH_SECRET`) honors per-type opt-outs in `notification_preferences` and builds copy via `lib/notificationPush.ts`. **User settings UI**: `NotificationPreferences` toggles (offers / alerts / followers / achievements). Also fixed/installed the PWA manifest + icon set so push reaches mobile (Android install + iOS add-to-home-screen). New env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_DISPATCH_SECRET`. *Requires per-env setup: VAPID keys + `push_dispatch_config` row (see `docs/docs.md`). Hosted DB can't reach localhost, so trigger delivery needs a public URL. Instant-vs-digest tiering (Pro) deferred to enforcement. SMS deferred.*

**Gating & limits — only after the build-out above:**

- [x] **Pro plan enforcement** — Gates live via `isPro()` (server) / `hasProAccess()` (pure, expiry-aware, incl. one-time payers) with `ProUpsell` teasers (gate = marketing surface, never a wall). **Strict enforcement, no grandfathering** (per decision 2026-06-20). Gated: **price history chart** (dashboard) + **portfolio analytics/ROI** (`/dashboard/analytics`), **manual market refresh** (bulk button + per-card ↻ — free relies on passive shared-cache propagation, see note), **bulk CSV export** (`/inventory/export`), **foil/holo showcase borders** (`ShowcaseEditor`, basic showcase stays free), **scheduled vacation + auto-reply** (`VacationModeCard`, basic pause stays free). **Pro Seller badge** already gated via `isProSubscriber`. *Deferred:* **instant-vs-timely price-alert delivery** — needs a digest/delay queue (new infra, not just a gate); today all push is instant. *Do not gate (kept free):* inventory (uncapped), pack reveals, standard price alerts, basic listing pause.
  - *Note:* the doc's "free = daily auto refresh" is infeasible on the JustTCG 100/day tier; instead free users get **passive** price updates (any Pro user's refresh of a shared card propagates to all holders), and the **manual** refresh is the Pro lever.
- [ ] **Error monitoring** — No error tracking service (e.g. Sentry) is integrated. *Uncaught client and server errors are currently invisible.* **This is the only remaining planned item.**
- [x] ~~**Freemium limits** (100-listing cap)~~ — **Dropped 2026-06-21.** Inventory stays uncapped and the listing cap is abandoned; capping marketplace supply works against the transaction-fee engine. Free listings are now unlimited.
- [x] ~~**Upgrade prompts**~~ — **Dropped 2026-06-21.** The existing `ProUpsell` teasers at gated surfaces are sufficient; with no listing cap there is no quota nudge to build.
- [x] ~~**2FA**~~ — **Dropped 2026-06-21.** Not pursuing optional TOTP at this time.

### Known Issues / Backlog

- [x] **Manual card entry fallback** — Resolved. JustTCG is now a secondary search source (`lib/search/justTcgSearch.ts`) covering most promos pokemontcg.io lacks — e.g. the Riolu from the Mega Evolution ETB (`ME: Mega Evolution Promo` #010) is now findable by name + collector number. Hand-entered cards also get a `manual:<cardId>` pricing identity that still resolves via JustTCG by name/number when a source has it.

### Phase 5

- [ ] **PWA performance migration** — Make the installed PWA fast without regressing the (already-fast) browser experience. Adopt Serwist for real SW caching (app shell + immutable card images + `NetworkFirst` data), convert `CardImage` to `next/image`, virtualize the inventory grid, code-split recharts, and fix dashboard render-time writes/waterfalls. Full plan, desktop/mobile impact analysis, and rollout notes in [`docs/pwa-performance-migration.md`](docs/pwa-performance-migration.md). *Not started.*
- [ ] **Shipping integration** — Label generation or shipping cost estimation; required before collecting transaction fees on shipped orders.
- [ ] **Multi-game support** — Polymorphic `CardSearchProvider` and `RaritySystem` architecture is complete; only Pokémon TCG is implemented. To add a new game: implement the two abstract classes in `lib/search/` and `lib/rarity/`, then register in their respective `index.ts` factories.

### Phase 6 — Engagement & Retention

> **Why this phase exists.** Phases 1–5 built extraordinary *breadth* — a multi-tier pricing
> engine, perceptual-hash scanning, variant-aware Master Sets, 50 badges, a full web-push stack,
> Stripe Pro — but **no loop and no reward**. Engagement was implicitly treated as "done" once
> badges + follows + notifications shipped, so this roadmap contained zero engagement items.
> The retention *plumbing* is fully built and load-bearing; **nothing recurring uses it**:
> `pg_cron` runs (daily price snapshot), web-push is wired end-to-end, `price_history` has
> ~3.2k rows and `card_price_snapshots` ~2.3k — and every badge/completion award still fires
> lazily only when a user is *already* on the page. There is no digest, no streak, no `last_seen`.
>
> **Sequencing constraint.** Production is pre-traction (14 profiles, 173 cards, 0 offers,
> 3 reveals). Crowd-dependent mechanics (comments, social feeds, leaderboard seasons) would ship
> into an empty room and read as dead. Everything below is **single-player or outward-shareable** —
> valuable to a user with nobody else on the platform. Reactions/comments are deliberately
> deferred (see backlog).
>
> Four independently shippable slices, ordered by leverage. Phase 6.0 unblocks the rest;
> Phase 6.1 is the only item that creates a return trigger.

- [x] **6.0 Feedback & motion foundation** — the missing `components/ui/` layer. Today there are
  **zero toasts, zero skeletons, zero `loading.tsx`/`error.tsx` across ~90 routes, and one
  `aria-live` in the whole app**; every async action is a silent wait or a hard refresh. Add
  `sonner` + `canvas-confetti`; create `components/ui/{Toast,EmptyState,Skeleton,Celebrate}.tsx`;
  extract the local non-exported `EmptyState` at `app/dashboard/page.tsx:69-93` (with a `size` prop
  to absorb the larger hand-rolled variant in `InventoryGrid`) and replace the bare one-liner
  empties. Add semantic tokens (`--color-success/danger/warning/info`) to stop the ~600-hit raw
  palette drift, plus `prefers-reduced-motion`-guarded entrance utilities — and retrofit that guard
  onto the existing infinite `.spin-border` / `.showcase-foil` / `.showcase-gold` loops.
- [x] **6.1 Daily Vault Loop** — *the return trigger.* New `lib/vaultDaily.ts` (pure) computing
  the day's portfolio delta + top movers, reusing `dailyChange`/`apiDailyChange`/`withLiveToday`
  from `lib/priceHistory.ts`. `VaultPulse` (delta headline + 30-day sparkline + streak flame) leads
  the dashboard, and wishlist matches move above the fold from position 7. Visit streak
  (`profiles.last_active_on` / `streak_days` / `streak_best` + a `touch_streak()` fn called **off**
  the render path — see the perf defect in `docs/pwa-performance-migration.md:34`). **Daily digest
  push** via `app/api/digest/daily/route.ts`, secret-authed on the existing `PUSH_DISPATCH_SECRET`
  pattern: it inserts a `daily_digest` notification and the existing `dispatch_push_notification()`
  AFTER INSERT trigger delivers the push with no new plumbing. Scheduled by `pg_cron` at 13:00 UTC
  (~8am ET), **after** the 02:00 UTC snapshot.
- [x] **6.2 Progression & Celebration** — the reward machinery never celebrates: badges are awarded
  during dashboard render then appear as one line in a list. First, extract the hardcoded threshold
  if-chain at `lib/badges.ts:171-203` into a `BADGE_THRESHOLDS` data table (with a Jest **parity
  test** against current output — this is the highest-risk refactor in the phase, and the blocker
  for any progress UI). Then `lib/badgeProgress.ts` + `NextMilestones` ("3 more cards → Century"),
  reusing `BadgeChip`'s existing locked state and folding in nearest-to-complete sets from
  `getSetCompletionSummaries()`. Confetti + toast on badge earn and set completion. Shareable
  achievement PNG via the installed `html-to-image` / `CardStudio` pipeline. Also fixes
  **`user_set_completions`**, which has full RLS/index/policy but **0 rows and no reader** — its
  writer only fires when a user views a set they *already* completed, so it never populates.
- [x] **6.3 First-run Activation** — a new user currently lands on four zeros, a Pro lock card, and
  three empty panels; **no onboarding exists anywhere in the codebase**. `lib/onboarding.ts` derives
  checklist state from data we already have (**no new table**): username, ≥1 card, a chase set, push
  enabled, a showcase pin. `OnboardingChecklist` replaces the wall-of-zeros while incomplete, then
  collapses to a progress strip (dismissible via `profiles.onboarding_dismissed_at`). Surfaces
  `/inventory/import` prominently — "bring your spreadsheet" is the strongest switching path and is
  currently buried. Day 0–7 nudges reuse the 6.1 digest cron. Should also fix `profile_showcase`
  (0 rows despite a complete UI + Pro borders — a discovery problem, not a build problem).
- [ ] **6.4 Collection Insights** — `recharts` is installed and **only `AreaChart` is used** (1 of
  ~10 chart types, at zero install cost). `lib/collectionInsights.ts` (pure aggregations by rarity,
  set, condition, finish, graded vs raw, value concentration, paid vs market) + `CollectionDna`
  (pie/radial rarity mix, bar top-sets) at a new `/inventory/insights`, reusing `RaritySymbol` for
  legends. Plus a shareable **"Vault Recap"** PNG (cards added, value growth, best pull, sets
  progressed) — an outward-share artifact that doubles as acquisition.

**Paywall boundaries set for this phase** (added to the Free vs. Pro reference below):
the **daily delta headline is free** (a value delta is not history browsing — gating it would make
6.1 useless to exactly the users most likely to churn; the Pro gate stays on the *chart* and
`/dashboard/analytics`), and **collection distribution is free** while cost-basis/ROI stays Pro.

### Engagement Backlog (documented, not scheduled)

Surfaced by the 2026-07-26 engagement audit; captured here so they aren't rediscovered later.

- [ ] **Following feed carries only listings** (`app/dashboard/page.tsx:237-249`) — follow a
  collector who doesn't sell and your feed is empty *forever*. Should also carry reveals, badge
  earns, and set completions. Cheap: the dashboard already merges 7 event types for the private
  activity feed, so a following-scoped version is largely a query change.
- [ ] **`/reveals` is invisible** — absent from `AppNav`, `robots: { index: false }`, and
  login-gated. The most inherently viral surface in the product cannot be found or shared.
- [ ] **Reactions / comments — deliberately deferred.** Zero comments, likes, or reactions exist
  anywhere in the codebase, so every social surface is publish-only. Revisit once there is enough
  content and enough users that a reaction has an audience (3 reveals total today).
- [ ] **`watchlist` is a passive bookmark list** — no `target_price`, no notification hook. A
  price-drop alert would reuse the `notifications` → push chokepoint verbatim. The `deal_watcher`
  badge needs 10 items and the table has 1 row.
- [ ] **`card_add_events` is unread** — 699 rows of scan-acceptance telemetry
  (`scan_candidate_index`, `accepted_first`, `modified_fields`, `feedback`) written by
  `app/api/scan-event/route.ts` and queried by nothing. Compare `scan_diagnostics`, which has an
  admin viewer.
- [ ] **Dashboard perf** — ~19 parallel Supabase queries + 3 sequential follow-ups, an unbounded
  per-user `price_history` fetch, and badge-award **writes during render**. Overlaps Phase 5's PWA
  migration.
- [ ] **Badge thresholds are duplicated** between `lib/badges.ts` (22 slugs) and the SQL
  `check_user_badges()` (~28 slugs). 6.2 extracts the TS half to data; the SQL half stays duplicated.
- [ ] **Schema snapshot drift** — `get_wishlist_matches()` is called from `app/dashboard/page.tsx`
  and `app/wishlist/page.tsx` but is **missing from `supabase/schema_6-22.sql`**; regenerate the
  snapshot. Conversely `get_platform_listed_value()` is in the snapshot and called from nowhere.

---

## Completed

- [x] **Card scanning (scan-to-add)** — Identify a card from a photo by **perceptual-hash image matching** (no OCR), then hand off to the existing add-card flow. Client crops + perspective-warps the photo and computes dHash-256 + pHash-64 on-device (`lib/scan/perceptualHash.ts`, isomorphic pure-JS); server hamming-compares (`lib/scan/hashIndex.ts`) against a prebuilt index of every known card image (`scan-index/index.json.gz` in Storage). Confidence gate (distance ≤125, margin ≥10) with a same-name reprint tie-set to tap; manual name+number fallback. `sharp` is kept off the request path (Vercel libvips). Entered from `/inventory/add` via `CardScanner`; diagnostics in `scan_diagnostics` + `/admin/scan-diagnostics`. Tooling: `pnpm scan:index` (build/refresh index) + `pnpm scan:replay` (regression harness, confidently-wrong = hard fail). *Replaced a retired OCR approach — history in `docs/card-scanning-research.md`; architecture in `CLAUDE.md`.*
- [x] **Near-realtime pricing system** — Cache-first multi-tier engine (`lib/pricing/`): shared `card_prices` cache (6h) + JustTCG (real-time raw + per-condition prices, gap-filler search) → pokemontcg.io bedrock, with a per-provider daily budget guard (`price_api_usage`) and cross-user value propagation (`propagateMarketValues` — market value only, never list price). Real per-condition raw pricing (`condition_prices`) and **graded slab medians** (PSA/BGS/CGC/ACE/SGC/TAG via cardmarket-api-tcg, `card_graded_prices`, 24h cache, 100/day budget) replace the flat condition/grade multipliers wherever real data exists. Source/freshness chip on listings; per-card + bulk "refresh to market" and "match listings to market" on inventory. Identity keys: `pokemon_api_id` / `tcg:<id>` / `manual:<id>`. Migrations: `card_prices`, `price_api_usage`, `condition_prices`, `card_graded_prices`. Env: `JUSTTCG_API_KEY`, `TCGGO_RAPID_API_KEY`, `POKEMON_TCG_API_KEY`.
- [x] **Homepage overhaul** — Rotating headline, How It Works section, comparison table, FAQ with `FAQPage` JSON-LD schema, collector reviews system (submission, admin approval queue, star bar, `/reviews` landing page), review prompt on dashboard at 10+ cards, admin notifications on review submit/edit.
- [x] **Donation button** — Ko-fi + PayPal + Stripe payment links on `/support`; Supporter badge displayed on profiles for Ko-fi donors. PayPal and Stripe verified working in production; Venmo accessible via PayPal checkout, Cash App via Stripe checkout.
- [x] **Offer system** — Buyers send cash/trade/bundle offers; sellers accept/reject/counter; full lifecycle (pending → accepted → completed) with 7-day auto-expiry, inventory holds, both-party receipt confirmation, and offer history
- [x] **Public user profiles** — Public profile at `/profile/[username]` with avatar, bio, specialty, city, followers, featured card, and tabbed listings/collection/wishlist views
- [x] **Card wishlist** — Cards the user wants to acquire with optional notes and price targets
- [x] **Trade matching** — Dashboard "Available Now" shows wishlist cards currently for sale; "Trade Matches" shows wishlist cards for trade
- [x] **Price alerts** — Notifies users when a matching listing drops to or below their wishlist target price; notification created automatically when a new listing matches a wishlist entry
- [x] **Custom SMTP** — Transactional email provider configured; password reset rate limit resolved
- [x] **Follows & feeds** — Follow collectors; follower/following lists with counts; mutual-follower labels; following feed on dashboard; marketplace filter to show only followed sellers; account setting to restrict offers to followers only

---

## Free vs. Pro Reference

> Gating decisions decided 2026-06-13; the table below is the reference.
> Phase 6 rows added 2026-07-26.

| Feature | Free | Pro |
|---|---|---|
| Card inventory | Unlimited | Unlimited |
| Current market value | Yes | Yes |
| Daily value change (delta + movers) | Yes | Yes |
| Daily digest push | Yes | Yes |
| Milestone progress + celebrations | Yes | Yes |
| Collection distribution / breakdowns | Yes | Yes |
| Active marketplace listings | Unlimited | Unlimited |
| Market price refresh | Auto (passive, shared cache) | On-demand (manual) |
| Watchlist | Yes | Yes |
| Dashboard & basic stats | Yes | Yes |
| Community & storefronts | Yes | Yes |
| Price alerts | Yes | Yes |
| Price alert delivery | Standard | Instant push |
| Pack reveals (log + publish) | Yes | Yes |
| Bulk CSV import | Yes | Yes |
| Collections (basic) | Yes | Yes |
| Listing pause / vacation mode | Basic | Scheduled |
| Price history charts | — | Yes |
| Portfolio analytics (ROI) | — | Yes |
| Collection showcase | Basic | Advanced |
| Foil / holo card borders | — | Yes |
| Bulk CSV export (tax/insurance) | — | Yes |
| Pro Seller badge | — | Yes |
| Supporter badge | Donors only | — |
