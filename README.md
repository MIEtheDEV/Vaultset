# Vaultset — Setup & Maintenance Guide

## Live Application

**Hosted URL:** [https://www.vaultset.app](https://www.vaultset.app)

```html
<a href="https://www.vaultset.app">Vaultset — The Ultimate Trading Card Platform</a>
```

## Repository

**GitLab:** [https://gitlab.com/wgu-gitlab-environment/student-repos/MIEtheDEV/vaultset](https://gitlab.com/wgu-gitlab-environment/student-repos/MIEtheDEV/vaultset)

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

Create a `.env.local` file in the project root with the following values, found in your Supabase project under **Settings → API**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

---

## 3. Database Setup

The database schema is managed directly in Supabase. There are no local migration files. To set up the database on a new project, restore from a schema dump of the live database (see section 7).

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

---

## 5. Project Structure

```
app/              # Next.js App Router pages and layouts
  (auth)/         # Login, register, forgot/update password
  api/            # API routes (pokemon-cards, pokemon-sets, account)
  account/        # Account settings
  dashboard/      # Main dashboard and report
  inventory/      # Card inventory and sealed products
  marketplace/    # Marketplace listings
  community/      # Community page
components/       # Shared React components
utils/supabase/   # Supabase client helpers (client, server, admin)
public/
  img/            # Static images
```

---

## 6. Supabase Auth Configuration

In the Supabase dashboard, ensure the following are configured under **Authentication → URL Configuration**:

- **Site URL**: your production domain (e.g. `https://vaultset.app`)
- **Redirect URLs**: include `http://localhost:3000/auth/callback` for local development and your production callback URL

The auth callback route is handled at `app/auth/callback/route.ts`.

---

## 7. Recreating the Database from Scratch

To export the current live schema:

```bash
# Via Supabase CLI
supabase db dump --linked -f schema.sql

# Via pg_dump (connection string from Supabase Dashboard → Settings → Database)
pg_dump "postgresql://postgres:[password]@[host]:5432/postgres" \
  --schema-only --no-owner --no-acl -f schema.sql
```

Run the resulting `schema.sql` against a fresh Supabase project via the SQL editor to restore.
