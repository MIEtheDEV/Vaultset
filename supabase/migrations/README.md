# Database Migrations

Schema changes are tracked here as timestamped SQL files. Each file is a forward-only migration — no rollback scripts.

## Setup (first time)

1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
2. Link to the project: `supabase link --project-ref <your-project-ref>`
3. Export the current live schema as the initial migration:
   ```
   supabase db pull
   ```

## Adding a migration

Name files with a timestamp prefix and a short description:

```
YYYYMMDDHHMMSS_description.sql
```

Example: `20260601120000_add_pack_reveals_table.sql`

## Applying migrations

```bash
supabase db push          # push local migrations to remote
supabase db diff          # preview what would change
supabase migration list   # see which migrations have been applied
```
