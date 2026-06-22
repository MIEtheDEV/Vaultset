# Security Audit — Vaultset

**Date:** 2026-06-21
**Scope:** Full project static audit — API routes, Stripe payment flows, server actions, admin authorization, auth/session/middleware, Supabase client usage, RLS policies (committed migrations), secrets, and `next.config.ts`.
**Method:** Manual source review of all `app/api/**/route.ts` handlers, all `actions.ts` server actions, `proxy.ts`, `utils/supabase/*`, `lib/auth/admin.ts`, committed SQL migrations, and config. No dynamic testing.

> **Note on scope limits:** The most security-sensitive tables (`profiles`, `offers`, `notifications`, `wishlist_items`, `reports`, `reviews`, messages, `collection_items`) are **not** present in committed migrations — they were applied by hand in the Supabase SQL Editor. Their RLS policies could not be verified from source. See finding **H-2**.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High     | 5 |
| Medium   | 9 |
| Low      | 10 |
| Info / verified-safe | many |

> Counts updated after live DB inspection (2026-06-21): added C-1 (Critical, confirmed admin self-promotion), H-4 (definer search_path), H-5 (billing-account takeover chain), M-8/M-9 (profiles exposure, review self-approval), L-10 (offers UPDATE).

The core trust boundaries are largely sound: Stripe webhook signature verification, server-side `getUser()` auth, price-tampering protection, per-action `assertAdmin()` checks, a non-spoofable DB-column admin model, and strictly server-side service-role key usage. The highest-impact gaps are unauthenticated/unthrottled endpoints that spend paid API quota, query injection + request amplification in CSV import, and unverifiable RLS on core tables.

## Remediation status (2026-06-21)

Code fixes for all actionable application-layer findings have been applied and verified (`tsc --noEmit`, ESLint, and 67 unit tests all pass). Live RLS inspection (2026-06-21) then confirmed one Critical and added several DB findings — all fixed via SQL in `docs/security_fixes.sql`:

- **Fixed in code:** H-1, H-3, **H-5 (billing reads/writes moved to service-role client in `checkout`/`portal`; `app/page.tsx` count no longer selects `*`)**, M-1, M-2, M-3, M-5, M-6, M-8 (app side), L-1, L-2, L-3, L-4, L-6, L-7, L-8, L-9.
- **Requires running SQL** (`docs/security_fixes.sql`):
  - **A** — `stripe_events` table (backs the M-2 idempotency code; required now).
  - **C** — `profiles` privileged-column trigger (**C-1, REQUIRED — confirmed admin self-promotion**; also guards `stripe_customer_id` for H-5).
  - **D** — pin `search_path` on 7 SECURITY DEFINER functions (H-4).
  - **E** — `reviews` approval-guard trigger (M-9).
  - **F** — restrict world-readable `profiles` columns (M-8/H-5). **Finalized** against the live column list — a plain `REVOKE`/`GRANT` (app side already done); just run it.
- **Documented, not code-changed:** L-5 (`card-price` costly path already bounded by the daily budget guard + 6h cache; durable rate limiting belongs at the edge); L-10 (`offers` broad UPDATE — server actions enforce the real workflow; optional transition-guard trigger).
- **Mitigated by design:** M-7 / price-table `using (true)` reads (non-sensitive shared pricing).
- **Verified safe via live RLS:** all 16 core tables have RLS enabled; `offers`/`messages`/`notifications`/`offer_items`/`conversations`/`collection_items`/`push_subscriptions`/`notification_preferences` correctly owner/participant-scoped.

---

## Critical

### C-1 — Privilege escalation: users can self-promote to admin via the `profiles` UPDATE policy
**Source:** Query B2 (live DB), 2026-06-21 — confirmed exploitable.
The `profiles` UPDATE policy is `USING (auth.uid() = id)` / `WITH CHECK (auth.uid() = id)`. It restricts *which row* a user may edit but not *which columns*, so a logged-in user can issue `PATCH /rest/v1/profiles?id=eq.<self>` with `{"is_admin": true}` and the update passes RLS. Because `lib/auth/admin.ts` trusts `profiles.is_admin`, this grants full admin (and lets a user self-set `is_pro`/`is_supporter` or clear their own `banned`/`cumulative_warnings`). This is the realized form of the H-2 risk.
**Remediation:** Run `docs/security_fixes.sql` **section C** (the `guard_profile_privileged_columns` trigger). It rejects changes to privileged columns unless made by the service role. **(Applied.)**
**Correction (2026-06-22, from live schema dump):** A pre-existing trigger `guard_profile_protected_columns` (likely added by the earlier `add security audit` pass) was already guarding these same columns at the DB level — not visible in the `pg_policies` inspection that informed this finding. So C-1 was likely **already mitigated in practice**; the live admin-self-promotion exploit would have been blocked. Our `guard_profile_privileged_columns` is now redundant-but-harmless (both triggers fire). Severity downgraded to **High** on this basis. Optional cleanup: drop one of the two duplicate triggers.

---

## High

### H-5 — Billing-account takeover via world-readable + user-writable `stripe_customer_id`
**Files:** `profiles` SELECT policy (M-8) + `profiles` UPDATE policy (C-1) + `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`
A chain across three weaknesses: (1) `stripe_customer_id` was world-readable via the public `profiles` SELECT, so any user could read a victim's Stripe customer id; (2) the `profiles` UPDATE policy had no column guard and the checkout route wrote `stripe_customer_id` via the authenticated client, so a user could set *their own* `stripe_customer_id` to the victim's; (3) the portal route opens a Stripe billing portal for whatever `stripe_customer_id` sits on the caller's row — handing the attacker control of the victim's subscription, payment methods, and invoices.
**Remediation (applied in code + SQL):** Billing-column reads/writes moved to the service-role client (`checkout`/`portal`), so `stripe_customer_id` no longer needs authenticated read/write; added `stripe_customer_id` to the `profiles` privileged-column guard trigger (section C); and section F removes it from the world-readable surface. With all three, none of the chain's links remain. **(Code done; SQL sections C + F run pending.)**

### H-1 — Query injection + unbounded request amplification in CSV import resolver
**File:** `app/api/import/resolve/route.ts:99-149` (interpolation at `:65`, `:83`)
Authenticated, but the handler places no cap on `rows.length` and issues one `fetchSetCards` per unique `set_name` plus a `fetchByName` fallback per unresolved row. An authenticated user can submit thousands of rows to force thousands of outbound requests to pokemontcg.io — draining the API quota and tying up the server (resource-amplification DoS). Additionally, `row.set_name` and `row.name` are interpolated unescaped into the Lucene `q` parameter (`set.name:"${setName}"`, `name:"${name}"`); an embedded `"` breaks out of the quoted clause (query injection against the upstream search).
**Note:** This is *not* SSRF — the fetch host is hard-coded to `api.pokemontcg.io`.
**Remediation:** Cap `rows.length` (e.g. ≤ 100) and the number of unique sets; strip/escape `"` and Lucene special characters before interpolation; bound total outbound fetches per request.

### H-2 — RLS on core tables is unverifiable from source control
**Files:** `supabase/migrations/*` (core tables absent), `supabase/verify_migrations.sql`
Only `card_prices`, `price_api_usage`, and `card_graded_prices` are created in committed migrations. The security-critical tables (`profiles`, `offers`, `notifications`, `wishlist_items`, `reports`, `reviews`, messages, `collection_items`) were applied by hand and never committed, so their RLS posture cannot be reviewed or regression-tested. Because the app uses the RLS-bypassing service-role client broadly (see M-4), and `lib/auth/admin.ts` trusts `profiles.is_admin`, the integrity of the entire authz model depends on RLS policies that are invisible here.
**Remediation:** Run `supabase db pull` to capture the live schema + RLS into a committed baseline migration. Then explicitly verify: (a) the `profiles` UPDATE policy forbids a user updating their own `is_admin`, `banned`, `is_pro`, `is_supporter`, `cumulative_warnings` (column-scoped `WITH CHECK` or a trigger); (b) `offers`, `notifications`, `messages`, `wishlist_items` restrict rows to the owner/participants.
**Status (2026-06-21):** RLS now **verified live** via inspection queries. All 16 core tables have RLS enabled. (b) confirmed correctly scoped. (a) confirmed **violated** → escalated to **C-1** above. The remaining gap is that these policies still are not in committed migrations — run `supabase db pull` to baseline them.

### H-4 — SECURITY DEFINER functions without a pinned `search_path`
**Source:** Query B3 output (live DB), 2026-06-21
Seven elevated-privilege functions have `config: null` (no `search_path` set): `auto_expire_offers`, `check_wishlist_price_alerts`, `create_follow_notification`, `create_offer_notification`, `get_platform_listed_value`, `get_platform_market_value`, `snapshot_price_history`. A `SECURITY DEFINER` function with an unpinned search_path can be hijacked by an object shadowed on the caller's path, executing attacker-controlled code with the definer's privileges (CVE-2018-1058 class). Practical exploitability is limited on Supabase (API users can't run DDL to create shadowing objects), hence High-but-mitigated rather than Critical.
**Remediation:** `alter function ... set search_path = public` for each — see `docs/security_fixes.sql` section D. **(SQL provided; run pending.)**

### H-3 — Unauthenticated endpoints spend paid/quota-limited API budget
**Files:** `app/api/pokemon-cards/route.ts:11`, `app/api/pokemon-sets/route.ts:3`
Both `GET` handlers are fully public (no `getUser()`, no rate limit). `pokemon-cards` invokes `searchJustTcg` (JustTCG free tier = 100 req/day) whenever a `number` is supplied or primary results are thin. An anonymous attacker can drain the daily JustTCG quota and hammer pokemontcg.io with arbitrary queries.
**Remediation:** Require an authenticated user, or at minimum add per-IP rate limiting before invoking the budgeted JustTCG path.

---

## Medium

### M-1 — Stripe entitlement grants don't check `payment_status === "paid"`
**File:** `app/api/stripe/webhook/route.ts:32-37` (donation/Supporter), `:42-54` (Pro)
`checkout.session.completed` can fire with `payment_status` of `unpaid`/`no_payment_required` for asynchronous/delayed payment methods. The handler grants `is_pro` / `is_supporter` on event receipt without checking `payment_status`, so an entitlement can be granted before funds settle.
**Remediation:** Gate grants on `session.payment_status === "paid"`; for async methods prefer `checkout.session.async_payment_succeeded`.

### M-2 — No Stripe webhook idempotency; one-time `pro_expires_at` extends on replay
**File:** `app/api/stripe/webhook/route.ts:6-95` (expiry computed at `:45`)
No dedup on `event.id`. Stripe may redeliver events, and a 500 triggers retries. Most updates are idempotent, but the one-time Pro expiry is `Date.now() + 30 days` computed at processing time, so a re-delivered event silently extends the window each time.
**Remediation:** Persist processed `event.id`s (table with a unique constraint) and short-circuit duplicates; or derive expiry from a stable timestamp on the session, not `Date.now()`.

### M-3 — Admin report actions trust client-supplied target IDs instead of deriving from the report
**File:** `app/admin/reports/actions.ts:116-155` (`notifyUser`), `:159-249` (`warnUser`), `:253-276` (`banUserFromReport`)
These actions receive `reportedUserId`, `offenseType`, and `reportedUsername` as client parameters and act on them directly; only `reportId` ties back to a real report, and the action never verifies the passed values match it. An admin (the only caller, since `assertAdmin()` gates these) can ban/warn an arbitrary user under cover of an unrelated report, breaking audit integrity.
**Remediation:** Load the report by `reportId` server-side and derive `reportedUserId`/`offenseType`/`reportedUsername` from it (or assert the params equal the report row). This also closes the message-body injection in L-6.

### M-4 — RLS-bypassing service-role client used broadly in user-facing pages/actions
**Files:** `app/offers/page.tsx:6`, `app/transactions/page.tsx:7`, `app/notifications/page.tsx:4`, `app/messages/[id]/page.tsx:7`, `app/reveals/page.tsx:7`, `app/dashboard/page.tsx:12`, `app/inventory/bulk-actions.ts:4`, `app/offers/actions.ts:5`, `app/api/card-price/route.ts:3`, others
`createAdminClient()` bypasses all RLS, so application code is solely responsible for scoping every query to the current user — the database provides no backstop. Any query in these files that forgets a `user.id` filter, or trusts a client-supplied id, becomes a horizontal-privilege/IDOR risk. (Spot-checked offer flows are correctly scoped; the risk is systemic, not a confirmed leak.)
**Remediation:** Prefer the RLS-scoped server client (`utils/supabase/server.ts`) for user-owned data; reserve the admin client for genuinely cross-user operations and confirm each such query constrains rows to the authenticated user.

### M-5 — `createOffer` doesn't verify the recipient owns the listing
**File:** `app/offers/actions.ts:19-60`
`recipientId` and `listingId` are both client-supplied and inserted without confirming `recipientId` owns `listingId`. Item-level ownership *is* validated (`:80-96`) and the accept path is recipient-scoped, so impact is limited, but a user can spam offers/notifications to arbitrary users and create inconsistent offer rows.
**Remediation:** Load the listing's `user_id` server-side and assert it equals `params.recipientId`.

### M-6 — `/admin` is not in the middleware protected-paths list
**File:** `proxy.ts:32`
`protectedPaths` omits `/admin`, so the edge middleware does not block unauthenticated requests there. The gap is closed by `app/admin/layout.tsx:9-13` (`getUser()` + `isUserAdmin()` redirect), so admin is defense-in-depth protected at the page layer only.
**Remediation:** Add `/admin` to `protectedPaths` for an early redirect; keep the layout check as the authoritative gate.

### M-7 — `card_prices` / `card_graded_prices` readable by all authenticated users (`using (true)`)
**Files:** `supabase/migrations/20260620120000_card_prices.sql`, `20260620140000_card_graded_prices.sql`
Both expose every row via `for select to authenticated using (true)`. Writes are correctly restricted to the service role (no write policy). The data is non-sensitive shared pricing by design — acceptable, but flagged so the broad read is a conscious decision rather than an oversight.
**Remediation:** No action needed unless pricing is ever considered proprietary; if so, restrict reads.

### M-8 — `profiles` is world-readable including sensitive columns
**Source:** Query B2 (live DB) — `profiles` SELECT policy `using (true)` for role `{public}` (includes anon).
Every column of every profile is readable by anyone, authenticated or not — including `stripe_customer_id` (billing identifier), `is_admin`, `banned`, and `cumulative_warnings`. This leaks payment-provider identifiers and lets anyone enumerate which accounts are admins or under moderation.
**Remediation:** Stop exposing sensitive columns to `anon`/`authenticated`. RLS can't filter columns, so use column-level grants. The app has been changed so no authenticated/anon query reads `stripe_customer_id`/`is_admin`/`cumulative_warnings` (billing reads moved to the service-role client; `app/page.tsx` count no longer selects `*`), making a plain `REVOKE SELECT ... GRANT SELECT (<safe cols>) ...` safe — no view or further app change needed. See `docs/security_fixes.sql` section F (column-list query + grant template). **(App code done; SQL run pending — paste the column list and I'll finalize the grant.)**

### M-9 — `reviews` UPDATE allows self-approval (moderation bypass)
**Source:** Query B2 (live DB) — `reviews` UPDATE policy `USING (user_id = auth.uid())`, no `WITH CHECK` column guard.
A user can `PATCH` their own review row to set `approved = true`, publishing it without admin moderation (admin approval is gated by `app/admin/reviews/actions.ts`, but RLS lets the user bypass it).
**Remediation:** Guard the `approved` column — `docs/security_fixes.sql` section E adds a trigger that preserves `approved` (and `approved`-related fields) unless changed by the service role. **(SQL provided; run pending.)**

---

## Low

### L-1 — Username enumeration + unthrottled lookup in `resolveLoginEmail`
**File:** `app/(auth)/login/actions.ts:15-39`
Unauthenticated server action returns `{ email }` for a valid username and a distinct "No account found with that username." for a missing one — an enumeration oracle with no rate limiting.
**Remediation:** Rate-limit by IP; return a generic error that doesn't distinguish missing usernames.

### L-2 — OAuth callback `next` param reflected into redirect without validation
**File:** `app/auth/callback/route.ts:7,17,19`
`next` is concatenated onto `origin` (`${origin}${next}`). Absolute URLs are neutralized by the prefix, but protocol-relative (`//evil.com`) or backslash variants can be parsed as external hosts by some browsers, and any internal path is reachable.
**Remediation:** Accept only `next` that `startsWith("/")` and not `//` (and not `/\`); otherwise default to `/dashboard`.

### L-3 — No security headers in `next.config.ts`
**File:** `next.config.ts:3-29`
No `headers()` function. Missing `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
**Remediation:** Add an async `headers()` returning these site-wide (at minimum HSTS, `nosniff`, and a frame-ancestors policy).

### L-4 — Push subscription `endpoint` stored without validation (SSRF surface)
**File:** `app/api/push/subscribe/route.ts:17-28`
`endpoint` is accepted as an arbitrary string and later used as a `fetch` target by the dispatch path. A malicious authenticated user could register an arbitrary URL to receive an outbound server request carrying notification payload data.
**Remediation:** Validate `endpoint` is `https://` with a host matching known push services (`*.push.apple.com`, `fcm.googleapis.com`, `*.notify.windows.com`, Mozilla autopush) before persisting.

### L-5 — No rate limit on single-card price resolution
**File:** `app/api/card-price/route.ts:16-47`
Authenticated but unthrottled. Each call runs `PriceFetchEngine.getPrices(..., { allowResolve: true })`, which can spend a JustTCG GET lookup plus `propagateMarketValues` write fan-out. Looping arbitrary `apiId` values can exhaust the daily budget and generate heavy DB writes.
**Remediation:** Add per-user rate limiting / a short cooldown; consider tightening the `allowResolve` budget.

### L-6 — Message-body injection via client-supplied `reportedUsername`/`reason`
**File:** `app/admin/reports/actions.ts:128-133, 214-219`
Client-supplied values are interpolated into system message bodies sent to users, letting an admin-crafted call place arbitrary content into platform-attributed messages. Low reach (admin-only); resolved by the M-3 fix (derive from DB).

### L-7 — Avatar upload buffers the full body before the size check
**File:** `app/api/avatar/upload/route.ts:40-51`
`req.formData()` parses/buffers the entire multipart body before the 2 MB `file.size` check, so a large POST is fully read into memory before rejection. (Magic-byte sniffing at `:14-54` is solid and correctly distrusts `Content-Type`.)
**Remediation:** Enforce a `Content-Length` cap before parsing the body.

### L-8 — Internal Supabase error messages returned to clients
**Files:** `app/api/avatar/upload/route.ts:66,77,100`; `report/route.ts:53`; `collections/route.ts:28`; `push/subscribe/route.ts:30`; `push/unsubscribe/route.ts:26`; `pwa/installed/route.ts:28`; `push/test/route.ts:50`; `pokemon-sets/route.ts:20-22` (proxies upstream status)
Raw DB/upstream error strings can disclose schema/constraint details.
**Remediation:** Log server-side; return generic messages and a fixed 502/503 for upstream failures.

### L-10 — `offers` UPDATE policy lets either party modify any column
**Source:** Query B2 (live DB) — `offers` UPDATE policy `USING ((auth.uid() = sender_id) OR (auth.uid() = recipient_id))`, no column/transition guard.
Either party can directly `PATCH` any column (`status`, `offer_amount`, `offer_type`) via the API. The damaging accept-time side effects (inventory swap) only run through the recipient-scoped server action, so a direct edit just produces an inconsistent row rather than an unauthorized transfer — hence Low. Still a defense-in-depth gap (e.g. a sender could flip `status` to `accepted` to mislead the UI).
**Remediation:** Optionally add a trigger restricting status transitions to the correct party and freezing economic fields after creation. Not included in the SQL by default (the server actions already enforce the real workflow); flagged for awareness.

### L-9 — Minor hardening: non-timing-safe secret compare; missing `search_path` pin; unvalidated follow target
- `app/api/push/dispatch/route.ts:14-17` — `x-push-secret` compared with `!==` (not timing-safe); use `crypto.timingSafeEqual` for consistency with the kofi webhook.
- `supabase/migrations/20260621140000_fix_offer_expire_trigger_recursion.sql` — `vaultset_expire_stale_offers` lacks `set search_path = public` (low risk as a non-`SECURITY DEFINER` trigger).
- `app/profile/actions.ts:5-12` — `followUser` doesn't validate `followingId` exists; relies on a FK constraint (confirm one exists).
- Stripe checkout hardcodes `payment_method_types: ["card"]` (`app/api/stripe/checkout/route.ts:53`) — best-practice/conversion, not security; omit to enable dynamic payment methods.

---

## Verified safe / correctly implemented

- **Stripe webhook signature** — raw body via `request.text()`, `constructEvent` with the webhook secret, rejects missing/invalid signatures, never JSON-parses before verifying (`stripe/webhook/route.ts:7,16-19`).
- **Stripe price tampering** — client sends only a `plan` key validated against a server-side allowlist; actual Price IDs and customer binding are server-resolved from the authenticated `user.id`; no IDOR on portal/checkout (`stripe/checkout/route.ts:23-46`, `portal/route.ts:9-21`).
- **Ko-fi webhook** — verification token checked with `timingSafeEqual` + length guard; anonymous donations early-return before any privileged write (`kofi-webhook/route.ts:7-12,50-58`).
- **Admin authorization** — every admin server action calls `assertAdmin()` first; admin status read from `profiles.is_admin` (DB column, not client-writable `user_metadata`) via service role (`lib/auth/admin.ts:10-25`).
- **Offer/message ownership** — accept/decline/cancel/receive flows bind the offer row to `user.id` before acting; `createOffer` validates per-item ownership; conversations derive both participants from `user.id` (`app/offers/actions.ts`, `app/messages/actions.ts`).
- **Account deletion** — network-verified `getUser()`, deletes only `user.id` (`account/delete/route.ts:13-21`).
- **Profile setup** — service-role write self-scoped to `id: user.id`; username validated `/^[a-z0-9_]{3,30}$/` and uniqueness-checked (`auth/setup/actions.ts:21-71`).
- **Secrets** — no hardcoded keys/tokens in source; `.env.example` is all empty placeholders; no secret exposed via `NEXT_PUBLIC_`; service-role key imported only by server code (`utils/supabase/admin.ts`).
- **Config** — no `typescript.ignoreBuildErrors` / `eslint.ignoreDuringBuilds`; `images.remotePatterns` pinned to trusted hosts.
- **RLS default-deny** — `price_api_usage` has RLS on with no policy (backend-only, correct); `notify_wishlist_listing_match` is `SECURITY DEFINER` with `set search_path = public`.

---

## Recommended priority order

1. **H-2** — `supabase db pull` to baseline + review RLS on core tables (unblocks confidence in M-4 and the whole authz model).
2. **H-3** — Add auth/rate-limiting to `pokemon-cards` / `pokemon-sets`.
3. **H-1** — Cap rows + escape query input in `import/resolve`.
4. **M-1, M-2** — Add `payment_status === "paid"` guard and `event.id` idempotency to the Stripe webhook.
5. **M-3, M-5** — Derive report targets server-side; verify listing ownership in `createOffer`.
6. **M-6, L-1, L-2, L-3** — Middleware `/admin`, login enumeration, callback `next` validation, security headers.
7. Remaining Low items as hardening.
