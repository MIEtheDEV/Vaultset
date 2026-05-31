# SEO Improvements — Pre-Crawl Checklist

## Critical

### 1. Noindex login + register pages
**Files:** `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`  
Add `export const metadata: Metadata = { robots: { index: false } }` to both.

### 2. Add new authenticated routes to robots.ts
**File:** `app/robots.ts`  
Add to the disallow list:
- `/messages/`
- `/offers/`
- `/wishlist/`
- `/inventory/products/`

### 3. Remove noindex from public profile pages
**File:** `app/profile/[username]/page.tsx`  
Remove `robots: { index: false }` from the `generateMetadata` return.

### 4. Wire existing OG image into profile metadata
**File:** `app/profile/[username]/page.tsx`  
The OG image generator already exists at `app/profile/[username]/card/opengraph-image.tsx`.  
Add to `generateMetadata` return:
```ts
openGraph: {
  images: [`/profile/${username}/card/opengraph-image`],
},
twitter: {
  card: "summary_large_image",
  images: [`/profile/${username}/card/opengraph-image`],
},
```

### 5. Add description to profile generateMetadata
**File:** `app/profile/[username]/page.tsx`  
Add a description based on available profile data, e.g.:  
`"Browse @{username}'s trading card collection on Vaultset."`

### 6. Add public profiles to sitemap
**File:** `app/sitemap.ts`  
Query all public profiles from Supabase (using admin client or public select on profiles table), map each to a `/profile/[username]` entry with:
- `changeFrequency: "weekly"`
- `priority: 0.7`
- `lastModified: new Date()`

---

## Medium

### 7. Add ProfilePage JSON-LD to profile pages
**File:** `app/profile/[username]/page.tsx`  
Add a `<script type="application/ld+json">` block with:
```json
{
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "mainEntity": {
    "@type": "Person",
    "name": "@{username}",
    "url": "https://vaultset.app/profile/{username}"
  }
}
```

---

## Lower Priority

### 8. Add description to /contact page
**File:** `app/contact/page.tsx`  
Add a metadata export with a description.

### 9. Add description to /privacy and /terms pages
**Files:** `app/privacy/page.tsx`, `app/terms/page.tsx`  
Add metadata exports with short descriptions.

### 10. Add description to /community page
**File:** `app/community/page.tsx`  
Already noindexed — low urgency, but good hygiene if it ever opens up.

---

## Reference — Current robots.ts disallow list (before changes)
```
/dashboard/
/inventory/
/account/
/api/
/marketplace/
/community/
```

## Reference — Current sitemap.ts coverage (before changes)
```
/ (priority 1.0)
/privacy (priority 0.3)
/terms (priority 0.3)
/contact (priority 0.4)
```
