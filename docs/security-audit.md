# Security Audit — 2026-06-21

Review of the application's attack surface: auth middleware (`proxy.ts`), all server
actions (`app/**/actions.ts`), every API route (`app/api/**/route.ts`), admin/payment/
webhook flows, and the available RLS context. Findings are ordered by severity. Each
lists the impact, the exploit, the affected code, and the recommended fix.

Status legend: **Open** (not yet fixed) · **Verify** (depends on Supabase dashboard
state not visible in the repo) · **Fixed**.

---

## 🔴 Critical — Admin privilege escalation via user-controlled metadata

**Status:** Open

Every admin authorization gate compares `user_metadata.username` to `ADMIN_USERNAME`:

- `app/admin/layout.tsx:11-12` — admin page access
- `app/admin/users/actions.ts:11` — `banUser`, `unbanUser`, `deleteUser`
- `app/admin/reports/actions.ts:12`
- `app/admin/reviews/actions.ts:11`
- `app/api/report/route.ts:30` — moderator rate-limit bypass

**Exploit:** `user_metadata` is writable by the user. The app already does this client-side
in `components/ProfileSettingsForm.tsx:117` (`supabase.auth.updateUser({ data: { username } })`).
Any authenticated user can run, from the browser console with their own session:

```js
await supabase.auth.updateUser({ data: { username: "<admin handle>" } })
```

and immediately gain full admin powers — ban/delete any account, moderate reports and
reviews. The username-uniqueness check in `completeProfileSetup` / `ProfileSettingsForm`
does **not** protect this path, because `updateUser` writes `user_metadata` directly and
bypasses that check. `ADMIN_USERNAME` is the owner's public handle, so it is not secret.

**Fix:** Stop trusting `user_metadata` for authorization. Either:
- Add `profiles.is_admin boolean`, writable only via SQL/service-role (no client UPDATE
  policy on the column); `assertAdmin()` reads it from the DB after `getUser()`, or
- Use Supabase **`app_metadata`** (service-role-only writes) and check
  `user.app_metadata.role === "admin"`.

Update all five gates above to use the new source of truth.

---

## 🟠 High — Probable self-grant of Pro / un-ban via direct `profiles` update

**Status:** Verify

`components/ProfileSettingsForm.tsx:137` updates `profiles` straight from the browser:

```ts
await supabase.from("profiles").update(patch).eq("id", userId);
```

So a client-side UPDATE policy on `profiles` exists. Postgres RLS is **row-level, not
column-level** — unless column GRANTs or a guard trigger are in place, that policy lets a
user update *any* column on their own row:

```js
await supabase.from("profiles")
  .update({ is_pro: true, is_supporter: true, pro_expires_at: "2099-01-01", banned: false })
  .eq("id", myId)
```

That is a free Pro/Supporter upgrade and ban evasion — defeating the Stripe/Ko-fi
monetization flow, which writes the same columns (`app/api/stripe/webhook/route.ts`,
`app/api/kofi-webhook/route.ts`).

**Cannot confirm from the repo** — base schema / RLS policies are not in the tracked
migrations. Verify the `profiles` UPDATE policy in the Supabase dashboard.

**Fix (if policy is unrestricted `auth.uid() = id`):**
- Revoke UPDATE on sensitive columns from `authenticated`:
  ```sql
  REVOKE UPDATE (is_pro, is_supporter, pro_expires_at, pro_plan, pro_auto_renews,
                 banned, stripe_customer_id) ON profiles FROM authenticated;
  ```
- Or add a BEFORE UPDATE trigger that rejects changes to protected columns unless the
  caller is the service role.

---

## 🟡 Medium — Offer items have no ownership validation

**Status:** Open

In `createOffer` (`app/offers/actions.ts:72-83`), `selectedItems` are inserted into
`offer_items` via the **admin (service-role)** client with no check that `offered` items
belong to the sender or that `requested`/listing items belong to the recipient. At
accept-time (`respondToOffer`, `app/offers/actions.ts`), offered/requested rows are
filtered only by `on_hold = false` / `transfer_status = null` — never by owner.

**Exploit:** A crafted offer referencing another user's `collection_item` id (these surface
in marketplace listings) can put a third party's card `on_hold`, clear its
`for_sale`/`for_trade` flags, and mint pending copies for an offer participant. This is
inventory tampering / griefing of non-participants rather than theft.

**Fix:** At offer creation, validate that `offered` item ids are owned by `sender_id` and
`requested` ids by `recipient_id` before inserting `offer_items`.

---

## 🟢 Low / Informational

- **Avatar upload** (`app/api/avatar/upload/route.ts`) trusts the client-sent
  `Content-Type` and never checks magic bytes, so arbitrary bytes can be stored in the
  public `avatars` bucket. Low risk: SVG is not allowed (no stored XSS) and uploads are
  size-capped. Consider validating magic numbers or re-encoding server-side.
- **Ko-fi webhook** (`app/api/kofi-webhook/route.ts`) uses a non-constant-time token
  compare (negligible timing risk) and `listUsers({ perPage: 1000 })` silently caps at
  1000 users — a functional bug more than a security one.
- **`market-refresh` owner check** (`app/api/market-refresh/route.ts:12`) is a hardcoded
  email (`OWNER_EMAIL`). It only bypasses a rate limit, but should move to config.
- **`import/resolve`** (`app/api/import/resolve/route.ts`) interpolates `set.name:"${setName}"`
  into a pokemontcg.io query string, not SQL — not injectable into the DB.

---

## What's solid

- Stripe webhook verifies signatures (`constructEvent`); donations are firewalled from Pro
  grants.
- The push-dispatch internal endpoint (`app/api/push/dispatch/route.ts`) is gated by a
  shared secret.
- API routes consistently use `getUser()` (network-verified) rather than `getSession()`
  for auth decisions.
- Ownership scoping in offer/collection actions uses server-derived `user.id` in
  `.eq()`/`.or()` filters — no PostgREST filter injection.
- The report route validates `reason` against an allowlist, rate-limits, and blocks
  self-reports.
- DB error details are surfaced only when `NODE_ENV !== "production"`.
