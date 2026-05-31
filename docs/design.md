# Vaultset — Design Document

## 1. Overview

Vaultset is a full-stack web application for trading card collectors. It is built on **Next.js 16 App Router** with **React 19** and backed by **Supabase** (PostgreSQL + Auth + Realtime). The application supports card collection management, a peer-to-peer marketplace, sealed product tracking, in-app messaging, wishlists, and a community hub.

The codebase is structured around a polymorphic game abstraction layer (`lib/`) that allows new trading card games to be supported by implementing two abstract classes — `CardSearchProvider` and `RaritySystem` — without modifying any existing application code.

---

## 2. System Architecture

```mermaid
graph TD
    subgraph Browser
        RC[React Client Components]
    end

    subgraph NextJS[Next.js Server]
        SC[Server Components]
        AR[API Routes]
        SA[Server Actions]
        CB[Auth Callback]
        MW[Middleware proxy.ts]
    end

    subgraph SupabaseCloud[Supabase]
        AUTH[Auth Service]
        DB[(PostgreSQL)]
        RT[Realtime]
        ST[Storage]
    end

    subgraph External[External APIs]
        TCG[Pokemon TCG API]
    end

    RC -->|supabase-js| AUTH
    RC -->|supabase-js| DB
    RC -->|supabase-js| RT
    RC -->|fetch| AR
    SC -->|SSR client| DB
    SC -->|SSR client| AUTH
    SA -->|SSR client| DB
    AR -->|CardSearchProvider| TCG
    AR -->|admin client| ST
    CB -->|exchangeCodeForSession| AUTH
    MW -->|getSession cookie check| AUTH
```

---

## 3. Module Structure

| Layer | Path | Responsibility |
|---|---|---|
| Pages & Layouts | `app/` | Routing, data fetching, page composition |
| Components | `components/` | Reusable UI — forms, grids, nav, messaging |
| Game Abstraction | `lib/search/` | Pluggable card search per game |
| Game Abstraction | `lib/rarity/` | Pluggable rarity/variant/finish logic per game |
| Shared Logic | `lib/wishlistMatches.ts` | Shared `WishlistMatch` type and dedupe helper |
| Shared Logic | `lib/avatarColors.ts` | Avatar color palette and resolution utilities |
| Shared Logic | `lib/moderation.ts` | `checkText()` — user content moderation |
| Shared Logic | `lib/products.ts` | Sealed product type definitions |
| Utilities | `utils/supabase/` | Supabase client factory (browser, server, admin) |
| Database | Supabase | PostgreSQL schema with row-level security |

### App Routes

| Route | Protection | Description |
|---|---|---|
| `/` | Public | Landing page |
| `/(auth)/login` | Public | Sign in |
| `/(auth)/register` | Public | Create account |
| `/(auth)/forgot-password` | Public | Password reset request |
| `/(auth)/update-password` | Public | Password reset via email link |
| `/auth/callback` | Public | Supabase post-login redirect handler |
| `/dashboard` | Auth required | Collection overview, stats, watchlist, wishlist |
| `/inventory` | Auth required | Card collection CRUD |
| `/inventory/add` | Auth required | Add card form |
| `/inventory/[id]/edit` | Auth required | Edit/delete card |
| `/inventory/products` | Auth required | Sealed product management |
| `/marketplace` | Public | Browse all sale/trade listings |
| `/marketplace/[id]` | Public | Listing detail with seller contact |
| `/messages` | Auth required | Conversation inbox |
| `/messages/[id]` | Auth required | Message thread with Realtime updates |
| `/community` | Public | Collector directory |
| `/account` | Auth required | Account settings (profile, password, delete) |
| `/profile/[username]` | Auth required | Public profile with tabs: listings, collection, wishlist |
| `/wishlist` | Auth required | Personal wishlist management |
| `/wishlist/add` | Auth required | Add card to wishlist |
| `/support` | Public | Ko-fi supporter link |

---

## 4. Class Diagram

### 4.1 Game Abstraction Layer

```mermaid
classDiagram
    class CardSearchProvider {
        <<abstract>>
        +game string
        +search(query, options) Promise
        +mapRarity(apiRarity) string
    }

    class PokemonTCGProvider {
        +game string
        +search(query, options) Promise
        +mapRarity(apiRarity) string
    }

    class RaritySystem {
        <<abstract>>
        +game string
        +getVariantInfo(rarity) RarityVariantInfo
        +getSortOrder(rarity) number
        +getDisplayLabel(rarity) string
        +getRarityOptions() RarityGroup
        +isFinishLocked(rarity) boolean
    }

    class PokemonRaritySystem {
        +game string
        +getVariantInfo(rarity) RarityVariantInfo
        +getSortOrder(rarity) number
        +getDisplayLabel(rarity) string
        +getRarityOptions() RarityGroup
    }

    class SearchResult {
        +id string
        +name string
        +number string
        +rarity string
        +subtypes string[]
        +set object
        +images object
    }

    class RarityVariantInfo {
        +variantKey string
        +variantLabel string
        +finishKey string
        +finishLabel string
    }

    CardSearchProvider <|-- PokemonTCGProvider
    RaritySystem <|-- PokemonRaritySystem
    CardSearchProvider ..> SearchResult : returns
    RaritySystem ..> RarityVariantInfo : returns
```

### 4.2 Data Entities

```mermaid
classDiagram
    class User {
        +id uuid
        +email string
        +user_metadata json
    }

    class Profile {
        +id uuid
        +username string
        +bio string
        +specialty string
        +city string
        +avatar_color string
        +avatar_url string
        +featured_card_id uuid
        +is_supporter boolean
        +created_at timestamp
    }

    class Card {
        +id uuid
        +game string
        +name string
        +set_name string
        +set_code string
        +card_number string
        +year integer
        +image_url string
        +game_data jsonb
    }

    class CollectionItem {
        +id uuid
        +user_id uuid
        +card_id uuid
        +condition string
        +finish string
        +quantity integer
        +paid_price numeric
        +list_price numeric
        +market_price numeric
        +for_sale boolean
        +for_trade boolean
        +grader string
        +grade numeric
        +cert_number string
        +product_purchase_id uuid
        +notes string
    }

    class ProductPurchase {
        +id uuid
        +user_id uuid
        +name string
        +product_type string
        +cost numeric
        +for_sale boolean
        +for_trade boolean
        +list_price numeric
        +purchased_at timestamp
        +notes string
    }

    class Watchlist {
        +id uuid
        +user_id uuid
        +item_id uuid
        +created_at timestamp
    }

    class Conversation {
        +id uuid
        +participant_1 uuid
        +participant_2 uuid
        +listing_id uuid
        +created_at timestamp
    }

    class Message {
        +id uuid
        +conversation_id uuid
        +sender_id uuid
        +body text
        +read_at timestamp
        +created_at timestamp
    }

    class WishlistItem {
        +id uuid
        +user_id uuid
        +pokemon_api_id string
        +card_name string
        +set_name string
        +card_number string
        +image_url string
        +notes string
        +created_at timestamp
    }

    User "1" --> "1" Profile : has
    User "1" --> "0..*" CollectionItem : owns
    User "1" --> "0..*" ProductPurchase : owns
    User "1" --> "0..*" Watchlist : watches
    User "1" --> "0..*" WishlistItem : wants
    User "1" --> "0..*" Conversation : participates in
    Conversation "1" --> "0..*" Message : contains
    Card "1" --> "0..*" CollectionItem : describes
    CollectionItem "0..*" --> "0..1" ProductPurchase : pulled from
    CollectionItem "1" --> "0..*" Watchlist : tracked by
    Conversation "0..1" --> "0..1" CollectionItem : references listing
```

---

## 5. Authentication Flow

```mermaid
sequenceDiagram
    actor User
    participant MW as Middleware (proxy.ts)
    participant App as Next.js App
    participant Auth as Supabase Auth

    User->>App: Submit login form
    App->>Auth: signInWithPassword()
    Auth-->>App: session tokens
    App-->>User: redirect to dashboard

    User->>MW: Visit protected page
    MW->>Auth: getSession() (cookie read, no network)
    Auth-->>MW: session present/absent
    MW-->>User: pass through or redirect to /login

    App->>Auth: getUser() (server-side verification)
    Auth-->>App: authenticated user
    App-->>User: render page
```

---

## 6. Messaging Flow

```mermaid
sequenceDiagram
    actor Buyer
    actor Seller
    participant App as Next.js App
    participant SA as Server Action
    participant DB as Supabase DB
    participant RT as Supabase Realtime

    Buyer->>App: Click "Contact Seller" or "Message"
    App->>SA: getOrCreateConversation(recipientId, listingId?)
    SA->>DB: SELECT conversation (sorted participant UUIDs)
    DB-->>SA: existing id OR null
    SA->>DB: INSERT conversation if missing
    DB-->>SA: conversation id
    SA-->>App: conversation id
    App-->>Buyer: redirect to /messages/[id]

    Buyer->>App: Send message
    App->>DB: INSERT into messages
    DB-->>RT: broadcast INSERT event
    RT-->>Seller: realtime push (if viewing thread)
    Seller-->>App: message appears without refresh
```

---

## 7. Wishlist Matching Flow

```mermaid
sequenceDiagram
    actor User
    participant App as Next.js Server Component
    participant DB as Supabase DB (RPC)

    User->>App: Load /dashboard, /wishlist, or /marketplace
    App->>DB: get_wishlist_matches(p_user_id)
    DB->>DB: JOIN wishlist_items → cards (via game_data->>'pokemon_api_id') → collection_items
    DB-->>App: WishlistMatch[] (deduplicated by listing_id)
    App-->>User: "Available Now" widget / "★ Wanted" badges
```

---

## 8. Add Card Data Flow

```mermaid
sequenceDiagram
    actor User
    participant Page as Add Card Page
    participant API as API Route
    participant TCG as Pokemon TCG API
    participant DB as Supabase DB

    User->>Page: type card name
    Page->>API: GET /api/pokemon-cards?q=name
    API->>TCG: search()
    TCG-->>API: card results
    API-->>Page: SearchResult[]

    User->>Page: select card
    Page->>Page: RaritySystem.getVariantInfo()

    User->>Page: submit form
    Page->>DB: UPSERT INTO cards
    Page->>DB: INSERT INTO collection_items
    DB-->>Page: success
    Page-->>User: redirect to inventory
```

---

## 9. Key Design Patterns

### Polymorphic Game Support
`CardSearchProvider` and `RaritySystem` are abstract base classes. Adding a new game (e.g. Magic: The Gathering) requires only implementing these two classes and registering the provider in `lib/search/index.ts`. No existing pages or components need to change.

### Server vs Client Components
Server Components (layouts, page data fetching) use the SSR Supabase client from `utils/supabase/server.ts`. Client Components (forms, interactive UI, realtime) use the browser client from `utils/supabase/client.ts`. Authentication state is shared via cookies, keeping the session consistent across both environments.

### Row-Level Security
All database tables enforce RLS policies in Supabase. Users can only read and write their own `collection_items`, `product_purchases`, `watchlist`, `wishlist_items`, and `messages`. Marketplace listings and profiles are readable by all authenticated users. Conversations are readable only by their two participants.

### Marketplace via Flags
There is no separate listings table. Cards and products are published to the marketplace by toggling `for_sale` or `for_trade` flags on `collection_items` and `product_purchases`. This keeps the data model simple and ensures inventory and marketplace are always in sync.

### Server Actions for Mutations
Write operations that require auth context and a redirect use Next.js Server Actions (`"use server"` files). The messaging flow uses `app/messages/actions.ts` to find or create a conversation atomically before navigating to the thread.

### Conversation Uniqueness
Conversations between two users are deduplicated by sorting participant UUIDs lexicographically before insert, enforced by a Postgres CHECK constraint (`participant_1 < participant_2`). This ensures exactly one conversation row per user pair regardless of who initiates.

### Wishlist Matching via Postgres RPC
The `get_wishlist_matches(p_user_id)` RPC function joins `wishlist_items → cards → collection_items` using the JSONB field `cards.game_data->>'pokemon_api_id'`. This performs the match entirely in the database. Client code deduplicates by `listing_id` using the `dedupeMatches()` helper in `lib/wishlistMatches.ts`.

### User Content Moderation
All user-generated text fields (bio, specialty, city, wishlist notes, message bodies) are run through `checkText()` from `lib/moderation.ts` before being written to the database.
