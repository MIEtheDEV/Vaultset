# Vaultset — Setup & Maintenance Guide

**Hosted:** [https://www.vaultset.app](https://www.vaultset.app)

This file covers **setup and maintenance only**. For everything else:

- **Architecture, providers, pricing/scan internals** → [`CLAUDE.md`](./CLAUDE.md)
- **System design, data model, flows, user guide** → [`docs/docs.md`](./docs/docs.md)
- **Roadmap & feature status** → [`TODO.md`](./TODO.md)

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- A [Supabase](https://supabase.com/) account and project

---

## 1. Install Dependencies

```bash
pnpm install
```

---

## 2. Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
E2E_TEST_EMAIL=       # Playwright auth tests
E2E_TEST_PASSWORD=
```

Keys are in the Supabase dashboard under **Settings → API**. The service role key is used only by `utils/supabase/admin.ts` for server-side admin operations (e.g. avatar storage).

**Optional feature keys** (pricing tiers, web-push VAPID keys, push dispatch secret, etc.) are each optional — an absent key disables its feature. See the full annotated list in [`CLAUDE.md`](./CLAUDE.md) → *Environment Setup*.

---

## 3. Database Setup

The database schema is managed directly in Supabase. There are no local migration files. To set up the database on a new project, restore from a schema dump of the live database (see section 6).

### Required Postgres Function

The wishlist matching feature requires a custom RPC function. Run this once in the Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION get_wishlist_matches(p_user_id uuid)
RETURNS TABLE (
  listing_id uuid,
  seller_id uuid,
  seller_username text,
  for_sale boolean,
  for_trade boolean,
  list_price numeric,
  condition text,
  grader text,
  grade numeric,
  card_name text,
  set_name text,
  card_number text,
  image_url text,
  game_data jsonb
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    ci.id, ci.user_id, p.username, ci.for_sale, ci.for_trade,
    ci.list_price, ci.condition, ci.grader, ci.grade,
    c.name, c.set_name, c.card_number, c.image_url, c.game_data
  FROM wishlist_items wi
  JOIN cards c ON c.game_data->>'pokemon_api_id' = wi.pokemon_api_id
  JOIN collection_items ci ON ci.card_id = c.id
  JOIN profiles p ON p.id = ci.user_id
  WHERE wi.user_id = p_user_id
    AND ci.user_id <> p_user_id
    AND (ci.for_sale OR ci.for_trade)
  ORDER BY ci.created_at DESC
$$;
```

### Required Realtime Publication

The messaging feature uses Supabase Realtime. Enable it for the `messages` table:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

---

## 4. Running the Application

### Development

```bash
pnpm dev
```

Opens at [http://localhost:3000](http://localhost:3000). Hot-reloading is enabled.

### Production Build

```bash
pnpm build
pnpm start
```

### Linting

```bash
pnpm lint
```

### Testing

```bash
pnpm test              # Jest unit tests
pnpm test:watch        # Jest watch mode
pnpm test:e2e          # Playwright E2E (auto-starts dev server)
pnpm test:e2e:ui       # Playwright debug UI
```

---

## 5. Supabase Auth Configuration

In the Supabase dashboard, ensure the following are configured under **Authentication → URL Configuration**:

- **Site URL**: your production domain (e.g. `https://vaultset.app`)
- **Redirect URLs**: include `http://localhost:3000/auth/callback` for local development and your production callback URL

The auth callback route is handled at `app/auth/callback/route.ts`.

---

## 6. Recreating the Database from Scratch

To export the current live schema:

```bash
# Via Supabase CLI
supabase db dump --linked -f schema.sql

# Via pg_dump (connection string from Supabase Dashboard → Settings → Database)
pg_dump "postgresql://postgres:[password]@[host]:5432/postgres" \
  --schema-only --no-owner --no-acl -f schema.sql
```

Run the resulting `schema.sql` against a fresh Supabase project via the SQL editor to restore. Then run the additional SQL in section 3 (RPC function and Realtime publication).
