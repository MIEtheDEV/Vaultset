# Vaultset — SEO Todo

## Priority 1 — Marketplace Indexing + Product Schema ✅
**Impact: Highest.** Listing pages are the most keyword-rich content on the platform. People search Google for specific cards for sale. Every listing was previously noindexed.

- [x] Remove auth redirect from `app/marketplace/layout.tsx` — unauthenticated users (Googlebot) now see the public nav instead of being redirected to /login
- [x] Remove `robots: { index: false }` from `app/marketplace/[id]/page.tsx`
- [x] Improve listing `generateMetadata` title: now includes card number, set year, and grader/grade (e.g. "Charizard #4 – Base Set (1999) – PSA 9")
- [x] Add `Product` JSON-LD schema to listing detail pages (name, description, image, price, availability, condition, seller with URL)
- [x] Remove `robots: { index: false }` from `app/marketplace/page.tsx`
- [x] Remove `robots: { index: false }` from `app/marketplace/user/[username]/page.tsx`
- [x] Remove auth redirect from `app/marketplace/user/[username]/page.tsx`
- [x] Remove auth redirect from `app/marketplace/[id]/page.tsx`
- [x] Add "Sign in to watch or make an offer" prompt in `ListingDetail` for unauthenticated visitors
- [x] Add listing pages to sitemap with real `created_at` as `lastModified`

## Priority 2 — Canonical Tags ✅
**Impact: High.** Prevents duplicate content penalties.

- [x] Add `alternates: { canonical: "https://vaultset.app" }` to root layout metadata
- [x] Add canonical to profile `generateMetadata` (`/profile/${username}`)
- [x] Add canonical to marketplace listing `generateMetadata` (`/marketplace/${id}`)
- [x] Add canonical to marketplace main page metadata (`/marketplace`)
- [x] Add canonical to marketplace user storefront `generateMetadata`
- [x] Add canonical to community page metadata
- [x] Add canonical to followers/following page metadata

## Priority 3 — Core Web Vitals (LCP) ✅
**Impact: High.** `fetchPriority="high"` and `loading="eager"` on above-the-fold images is a direct ranking signal via Core Web Vitals.

- [x] Add `fetchPriority="high"` and `loading="eager"` to hero card images in `components/HeroCardStack.tsx`

## Priority 4 — Open Community Page to Indexing ✅
**Impact: Medium.**

- [x] Remove `robots: { index: false }` from `app/community/page.tsx`
- [x] Add community page to sitemap

## Priority 5 — Fix Empty Alt Text ✅
**Impact: Medium.**

- [x] Fix `alt=""` on activity feed card image in `app/dashboard/page.tsx` → now uses `event.label`

## Priority 6 — Enrich Profile Metadata ✅
**Impact: Medium.** Profile descriptions now include card count, specialty, and city pulled live from the database.

- [x] Fetch profile data inside `generateMetadata` (specialty, city, card count)
- [x] Build dynamic description: "Browse @{username}'s {count}-card collection · {specialty} · {city} on Vaultset."
- [x] Add `keywords` to profile metadata (username, specialty, city)

## Priority 7 — Fix Sitemap lastModified ✅
**Impact: Medium.**

- [x] Use `profile.created_at` as `lastModified` for profile sitemap entries
- [x] Add marketplace listing pages to sitemap with their `created_at`
- [x] Add marketplace main page to sitemap (priority 0.9, daily)
- [x] Add community page to sitemap (priority 0.6, weekly)

## Priority 8 — Product JSON-LD on Listing Pages ✅
Covered in Priority 1.

- [x] `Product` schema with name, description, image, offers (price, currency, availability, itemCondition), seller (Person with URL)

## Priority 9 — Twitter Site Handle ✅
**Impact: Low.**

- [x] Add `twitter: { site: "@vaultsetapp" }` to root layout metadata

## Priority 10 — BreadcrumbList Schema ✅
**Impact: Low.**

- [x] Add `BreadcrumbList` JSON-LD to `app/profile/[username]/followers/page.tsx`
- [x] Add `BreadcrumbList` JSON-LD to `app/profile/[username]/following/page.tsx`
- [x] Add `BreadcrumbList` JSON-LD to `app/marketplace/[id]/page.tsx` — Home → Marketplace → [Card Name]

## Priority 11 — Default OG Image for Static Pages
**Impact: Low.** Contact, privacy, terms, and support pages show no image when shared on social media. Root layout now references `/og-default.png`.

- [x] Add `openGraph.images` with `/og-default.png` to root layout metadata
- [x] `app/opengraph-image.tsx` already existed and generates a branded 1200×630 image dynamically via `next/og`. Updated root layout to reference `/opengraph-image` instead of the non-existent static file.

---

## Remaining

**All items complete.** ✅
