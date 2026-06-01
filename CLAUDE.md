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
