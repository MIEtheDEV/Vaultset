# PWA Performance Migration

**Status:** Planned — not started. This is a handoff/plan doc.
**Goal:** Make the installed PWA fast without regressing the already-fast browser experience (desktop + mobile).

---

## Context & Framing

The **browser** version of Vaultset is currently fast enough on both desktop and mobile. The complaint is specifically that the **installed PWA feels slow**.

**Critical framing (do not lose this):** There is *no separate "PWA build."* A PWA is the same website plus two artifacts — the manifest (`public/site.webmanifest`) and the service worker (`public/sw.js`). The same code is served to every visitor. So with one exception (the service worker, see below), every change here lands on regular browser visitors too, not on an isolated PWA build.

Therefore the operative constraint is: **do not regress the fast browser experience.** Most changes below are general optimizations that are help-or-neutral for the browser. Only the service worker change (#1) has real blast radius on browser behavior, because a service worker runs in normal browser tabs — not just in the installed app.

---

## Locked-in Decisions

- **Adopt Serwist** (maintained successor to `next-pwa`; works with Next 16 App Router) rather than hand-rolling caching in `sw.js`. Build-hash-keyed precaching means new deploys bust the cache automatically.
- **Conservative caching first.** Treat #1 as PWA-focused-but-browser-safe: cache only immutable assets (app shell keyed to build hash, immutable card images). `NetworkFirst` for data/API routes so prices/content never go stale. Hold off on aggressive caching until a deploy-and-refresh cycle is verified clean.
- **`skipWaiting` + `clientsClaim` ON** in the Serwist config, so installed users pick up the new caching on their next launch without a manual refresh. Paired with Serwist's default build-hash precaching so a page never mixes old and new chunks.
- **No reinstall required for existing installed users** — confirmed behavior, see "Rollout" below. The installed app is a thin wrapper pointing at the live site; the SW updates itself via the browser's built-in lifecycle.

---

## Diagnosis — Current Bottlenecks

Findings from the codebase audit (file:line references current as of writing):

1. **Service worker caches nothing.** `public/sw.js:11` is `self.addEventListener("fetch", () => {})` — an empty handler by design (installability only). Every navigation/asset/image re-hits the network. Registered via `components/ServiceWorkerRegistrar.tsx:15`, mounted in `app/layout.tsx:77`. The SW otherwise handles web-push only (`push`/`notificationclick`).
2. **Unoptimized `<img>` on every card.** `components/CardImage.tsx:21` (grid thumb) and `:48` (full-res modal) use raw `<img>` — no `srcset`, WebP/AVIF, resizing, or lazy-load. Used by `components/MarketplaceGrid.tsx:366` (up to 200 cards) and `components/InventoryGrid.tsx:342` (entire collection). Dashboard "Recently Added" also raw `<img>` (`app/dashboard/page.tsx:644`).
3. **Inventory loads the entire collection.** `app/inventory/page.tsx:24-55` has no `.limit()`; all items ship to the client and each renders a heavy component (images + `RefreshValueButton`, `ListAtMarketButton`, `DailyChange`). No virtualization anywhere in the app (no windowing lib in `package.json`).
4. **Dashboard does writes + waterfalls during render.** `app/dashboard/page.tsx` runs an 18-query `Promise.all` (good) but then ~5-6 sequential dependent round-trips (`:227-258`) plus **DB writes during render** — `awardBadges(...)` (`:288`) and a notification insert (`:293`). Unbounded `price_history` scan at `:195-199` (no date bound).
5. **recharts bundled with no code-splitting.** `components/PortfolioChart.tsx:4` imports recharts (large, D3-based) statically; rendered on the dashboard (`:467`). Zero `next/dynamic` usage app-wide.
6. **Marketplace global table scan.** `app/marketplace/page.tsx:120` fetches the entire `follows` table to count followers in memory.
7. **`next.config.ts` image config untuned** — `remotePatterns` only; no `formats`, `deviceSizes`, `imageSizes`, or `minimumCacheTTL`. No `Cache-Control` headers (only security headers).

---

## The Plan (prioritized)

| # | Change | Impact | Effort | Browser risk |
|---|---|---|---|---|
| 1 | Serwist SW: cache app shell + immutable images, `NetworkFirst` for data | 🔥🔥🔥 | Medium | **Yes — the only one.** Stale-content risk if careless |
| 2 | `CardImage` → `next/image` + tune `next.config.ts` images | 🔥🔥🔥 | Low | Neutral-to-positive |
| 3 | Virtualize inventory grid (`@tanstack/react-virtual`) | 🔥🔥 | Medium | None (only affects large collections) |
| 4 | Dashboard: move writes out of render, collapse waterfalls, bound `price_history` | 🔥🔥 | Medium | None (server-side TTFB) |
| 5 | Dynamic-import recharts (`next/dynamic`, `ssr:false`) | 🔥 | Low | None (pure win) |
| 6 | Marketplace `follows` scan → grouped count / RPC | 🔥 | Low | None (server-side TTFB) |

**Suggested sequencing:** #2 first (quick, high-impact, browser-safe) → #1 (biggest PWA win, needs care) → #3 → #5 → #4 / #6 (backend cleanup).

If the PWA complaint is specifically **initial load / launch**, weight #1, #5, #4, #6. If it's **scroll/interaction once inside**, weight #2, #3. *(Open question — confirm which; see below.)*

---

## Desktop vs Mobile Impact

The pattern: **#1, #2, #3, #5 are client/network wins that help mobile far more than desktop** (weaker CPU, slower/metered network, less memory). **#4 and #6 are server-side TTFB wins that help both platforms equally.**

- **#1 Serwist:** Mobile 🔥 (near-instant repeat launches, images survive flaky/metered connections, no re-download of JS on cold start). Desktop: helpful but fast network already hides much of the cost.
- **#2 next/image:** Mobile 🔥 (serves ~200px AVIF instead of 700px PNG — big byte + decode savings on weak GPUs). Desktop: real but smaller (hi-res displays request larger variants).
- **#3 Virtualize:** Mobile 🔥 (DOM node count is what kills mobile; caps live DOM regardless of collection size). Desktop: noticeable only on large collections. Scales with collection size, not platform.
- **#4 Dashboard waterfalls/writes:** Both equally — server-side wall-clock before anything renders.
- **#5 Dynamic recharts:** Mobile 🔥 (parsing/executing a large JS bundle is far costlier on mobile CPU). Desktop: mostly a transfer-size win.
- **#6 follows scan:** Both equally — server-side query fix.

---

## Serwist Implementation Notes

- Cache strategies:
  - **Precache** app shell + static JS/CSS, keyed to build hash (automatic — busts on every deploy).
  - **`StaleWhileRevalidate`** for card images (immutable once fetched — the free win). Hosts: `images.pokemontcg.io`, `**.pokemontcg.io`, `tcgplayer-cdn.tcgplayer.com`, `product-images.tcgplayer.com`, `images.scrydex.com` (mirror `next.config.ts:4-28`).
  - **`NetworkFirst`** for API/data routes (`/api/*`, page data) so prices/listings never go stale.
- Config: `skipWaiting: true`, `clientsClaim: true`.
- The existing `sw.js` also handles **web-push** (`push`, `notificationclick`) — this MUST be preserved when migrating to Serwist (Serwist supports custom SW code alongside its generated caching). Do not drop push handling. See `docs/docs.md` → "Web Push" and `lib/push.ts`.
- `components/ServiceWorkerRegistrar.tsx` registration may need adjusting depending on how Serwist injects/registers.

---

## next/image + config Notes (#2)

- Convert `CardImage.tsx` grid thumbnail to `next/image` with `fill` + a correct `sizes` (small on mobile). The full-res modal (`:48`) can stay eager or use a larger variant.
- Add to `next.config.ts` `images`: `formats: ['image/avif','image/webp']`, sensible `deviceSizes`/`imageSizes`, and `minimumCacheTTL`.
- `next/image` routes through Vercel's optimizer (slight first-hit latency per image, then CDN-cached) — acceptable and normal.
- Pattern already used correctly elsewhere: `app/dashboard/page.tsx:513`, `app/inventory/page.tsx:246`.

---

## Rollout — Existing Installed Users (No Reinstall)

**Confirmed: existing installed PWA users never need to reinstall.**

- The installed app is a thin wrapper pointing at the live site — always loads deployed code.
- The SW updates via the browser's built-in lifecycle: on next launch the browser re-requests `sw.js`, byte-compares, installs the new one in the background, then activates it.
- With `skipWaiting` + `clientsClaim`, the new caching SW takes over essentially on the next launch (without them it waits until all old-SW tabs/windows close — possibly a one-launch delay).
- **First-deploy transition:** existing users currently have the no-op SW (caches nothing), so their first post-deploy launch still hits the network normally; the launch *after* that is when they feel the speedup. Automatic for every future deploy thereafter.

---

## Verification

- Establish a **baseline first** (Lighthouse + bundle size) so before/after is measurable.
- After #1: run a **deploy → refresh cycle** and confirm no stale JS/content (the one real regression risk). Verify a new deploy is picked up on next launch.
- Confirm **web-push still works** after the Serwist migration (subscribe/receive) — see `docs/docs.md` "Web Push".
- Re-check Lighthouse on mobile emulation specifically.

---

## Open Questions

1. Is the PWA slowness mainly **initial load/launch** or **scroll/interaction once inside**? (Determines whether to weight #1/#5/#4/#6 vs #2/#3.)
2. #3: virtualize the inventory grid vs. server-side pagination? Leaning **virtualize** (`@tanstack/react-virtual`) since filter/sort/search are already client-side in-memory (`InventoryGrid.tsx:144-173`).
3. Aggressive vs. conservative image caching TTL — start conservative, revisit after baseline.
