# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vaultset** is a trading card collection management platform built with Next.js and React 19. Users manage card inventories, track market values, participate in a marketplace, and interact with a collector community. Currently focused on Pokémon TCG but architected for multi-game support.

## Tech Stack

- **Framework:** Next.js 16.2 (App Router)
- **UI:** React 19, Tailwind CSS 4
- **Backend/Auth/DB:** Supabase (PostgreSQL + Auth via `@supabase/ssr`)
- **Testing:** Jest 30 (unit, jsdom), Playwright 1.60 (E2E)
- **Language:** TypeScript 5
- **Package manager:** pnpm (Node 18+)

## Commands

```bash
pnpm dev           # Start dev server at http://localhost:3000
pnpm build         # Production build
pnpm lint          # ESLint

pnpm test                                                    # All Jest unit tests
pnpm test:watch                                              # Jest watch mode
pnpm test -- __tests__/lib/rarity/PokemonRaritySystem.test.ts  # Single test file

pnpm test:e2e      # Playwright E2E (auto-starts dev server)
pnpm test:e2e:ui   # Playwright debug UI
```

## Architecture

### Directory Structure

```
app/                     # Next.js App Router
  (auth)/                # Auth pages: login, register, forgot-password, update-password
  auth/callback/         # Supabase post-login redirect handler
  api/                   # API routes: pokemon-cards, pokemon-sets, account/delete
  dashboard/             # Dashboard + report
  inventory/             # Card inventory CRUD; inventory/products/ for sealed products
  marketplace/           # Listings, detail view, user storefront
  community/             # Community features
  account/               # Account settings
components/              # Shared React components
lib/
  search/                # Polymorphic card search (CardSearchProvider, PokemonTCGProvider)
  rarity/                # Polymorphic rarity systems (RaritySystem, PokemonRaritySystem)
  products.ts            # Sealed product type definitions (ETB, Booster Box, Blister, etc.)
utils/supabase/
  server.ts              # SSR Supabase client (Server Components, API routes)
  client.ts              # Browser Supabase client
  admin.ts               # Service-role client for admin operations
__tests__/lib/           # Jest unit tests mirroring lib/ structure
e2e/                     # Playwright E2E specs
proxy.ts                 # Next.js middleware: session refresh + route protection
```

### Polymorphic Provider Pattern (Multi-Game Support)

Both `lib/search/` and `lib/rarity/` follow the same pattern: an abstract base class + a game-specific implementation + a registry/factory in `index.ts`.

**Search:** `CardSearchProvider` (abstract) → `PokemonTCGProvider` → `getSearchProvider(game)` factory  
**Rarity:** `RaritySystem` (abstract) → `PokemonRaritySystem` → `getRaritySystem(game)` factory

All app code calls the factory; no caller knows the concrete implementation. To add a new game, implement the abstract class and register it in the relevant `index.ts`.

**Card search sources:** `/api/pokemon-cards` merges pokemontcg.io (primary; rich data + images) with **JustTCG** (`lib/search/justTcgSearch.ts`, gap-filler for promos/new cards pokemontcg.io lacks). JustTCG results carry `tcg:<productId>` ids and TCGplayer-CDN images, deduped against the primary by name+number. Promos are always surfaced (a few led to the top) so they're not buried by newest-first ordering.

### Pricing Layer (`lib/pricing/`)

A cache-first, multi-tier pricing engine that follows the same provider+factory pattern: `PriceProvider` (abstract) → concrete sources → `getPriceProviders()` factory (returns only configured tiers, in order).

- **Shared cache:** `card_prices` (keyed by `card_api_id` = pokemontcg.io id, e.g. `sv4-1`) fronts every external call. Rows < **6h** old are served without hitting any API. Cross-user: one refresh benefits everyone.
- **Tiers (in cascade order):** JustTCG (real-time batch, 20/POST, free 100 req/day — needs `JUSTTCG_API_KEY`) → TCGGo (scaffold, `TCGGO_RAPID_API_KEY`) → PokéWallet (scaffold, `POKEWALLET_API_KEY`) → **pokemontcg.io bedrock** (always available, ~24h stale). Unconfigured tiers are skipped.
- **Circuit breaker:** a provider that throws `PriceProviderError(429|401|403)` is dropped and its cards cascade; a card merely *absent* from a provider's result also cascades (one source's 404 ≠ a global miss).
- **Budget guard:** `price_api_usage` tracks per-provider daily requests; a provider over its `dailyRequestCap` is skipped.
- **ID mapping:** JustTCG keys on `tcgplayerId`, which we don't store. The single-card on-demand path (`/api/card-price`, `allowResolve`) resolves it via a JustTCG GET lookup and persists `card_prices.tcgplayer_id` so future batches use the cheap POST endpoint. Until mapped, cards fall through to bedrock. JustTCG matching is **confident-or-nothing** (`bestMatch`): number-anchored + name/set verified; it refuses to guess to avoid attaching a wrong card's price.
- **Cache key (`priceApiId`, `lib/pricing/cardIdentity.ts`):** `pokemon_api_id` (pokemontcg.io cards) → else `tcg:<productId>` (JustTCG-sourced cards, no pokemon_api_id) → else `manual:<cardRowId>` (hand-entered cards). All three flow through the same engine/cache.
- **`PriceFetchEngine`** is backend-only (constructed with the admin client). Prices stay in pokemontcg.io's `tcgplayer.prices` shape so `PokemonTCGProvider.getMarketPrice()` (finish/edition/condition/grade) is reused. Entry points: `/api/market-refresh` (bulk, manual, 24h-limited) and `/api/card-price` (lazy, single-card, on detail view).
- **Condition pricing:** for **raw** cards, `getMarketPrice` uses JustTCG's real per-condition prices when present (`card_prices.condition_prices`, `{finish:{condition:price}}`), falling back to NM market × a condition multiplier when not.
- **Graded pricing (`lib/pricing/gradedPrices.ts`):** for **graded** cards, `getMarketPrice` uses real slab medians (eBay USD, PSA/BGS/CGC/ACE/SGC/TAG, sample ≥ 2) from **cardmarket-api-tcg** (RapidAPI, `TCGGO_RAPID_API_KEY`), keyed by `tcgid` = our `pokemon_api_id` (exact lookup, no fuzzy matching). Stored in its own `card_graded_prices` table, **lazy + 24h-cached**, budget-guarded at 100/day (`price_api_usage` provider `tcggo`). Falls back to the grade multiplier for half-grades, thin samples, uncovered graders, or non-pokemontcg.io cards. Fetched only when a graded item references the card (`ensureGradedPrices`); `readGradedPrices` is the no-fetch path used during propagation.

### Authentication & Middleware

`proxy.ts` is the Next.js middleware file (exports `proxy` function + `config` matcher). It:
- Refreshes the Supabase session on every non-static request
- Redirects unauthenticated users to `/login` for `/dashboard`, `/inventory`, `/account`

The middleware uses `getSession()` (cookie read, no network) for the guard check. Protected pages call `getUser()` themselves for full server-side verification.

### Supabase Client Usage

- **Server Components & API routes:** `utils/supabase/server.ts` (`createServerClient`)
- **Client Components:** `utils/supabase/client.ts` (`createBrowserClient`)
- **Admin operations (service role):** `utils/supabase/admin.ts`

## Environment Setup

Required `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
E2E_TEST_EMAIL=       # Playwright auth tests
E2E_TEST_PASSWORD=
```

Optional pricing keys (each gates a tier in `lib/pricing/`; absent = tier skipped):
```
POKEMON_TCG_API_KEY=  # raises pokemontcg.io rate limits (bedrock works without it)
JUSTTCG_API_KEY=      # JustTCG real-time batch pricing (Tier 1)
TCGGO_RAPID_API_KEY=  # TCGGo via RapidAPI (graded PSA/BGS/CGC + EU); not yet wired
POKEWALLET_API_KEY=   # PokéWallet (scaffold, not yet wired)
```

Keys are in the Supabase dashboard under **Settings → API**.

**Database:** Schema changes are tracked in `supabase/migrations/`. Use the Supabase CLI (`supabase db push`) to apply them. To bootstrap a fresh project, run `supabase db pull` to export the live schema as the initial migration, then `supabase db push` for all subsequent changes. See `supabase/migrations/README.md` for details.

**Supabase Auth redirect URLs** (Authentication → URL Configuration):
- Local: `http://localhost:3000/auth/callback`
- Production: `https://vaultset.app/auth/callback`

## Testing Notes

- **Playwright** runs Chromium only, non-parallel (`fullyParallel: false`), retries once. Screenshots on failure, traces on first retry. The dev server auto-starts via `webServer` config.
- **Jest** uses jsdom, the `@/` path alias, and loads `@testing-library/jest-dom` in `jest.setup.ts`.
- E2E tests use `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` from `.env.local`; `global-teardown.ts` cleans test state.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on push to main/master and PRs:
1. Install pnpm v9, Node 22
2. `pnpm install`
3. `pnpm test` (unit)
4. Install Playwright browsers → `pnpm exec playwright test` (E2E)

Secrets are injected from the GitHub `production` environment.
