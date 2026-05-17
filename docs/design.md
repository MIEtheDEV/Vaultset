# Vaultset — Design Document

## 1. Overview

Vaultset is a full-stack web application for trading card collectors. It is built on **Next.js 16 App Router** with **React 19** and backed by **Supabase** (PostgreSQL + Auth). The application supports card collection management, a peer-to-peer marketplace, sealed product tracking, and a community hub.

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
        CB[Auth Callback]
    end

    subgraph SupabaseCloud[Supabase]
        AUTH[Auth Service]
        DB[(PostgreSQL)]
    end

    subgraph External[External APIs]
        TCG[Pokemon TCG API]
    end

    RC -->|supabase-js| AUTH
    RC -->|supabase-js| DB
    RC -->|fetch| AR
    SC -->|SSR client| DB
    SC -->|SSR client| AUTH
    AR -->|CardSearchProvider| TCG
    CB -->|exchangeCodeForSession| AUTH
```

---

## 3. Module Structure

| Layer | Path | Responsibility |
|---|---|---|
| Pages & Layouts | `app/` | Routing, data fetching, page composition |
| Components | `components/` | Reusable UI — forms, grids, nav |
| Game Abstraction | `lib/search/` | Pluggable card search per game |
| Game Abstraction | `lib/rarity/` | Pluggable rarity/variant/finish logic per game |
| Utilities | `utils/supabase/` | Supabase client factory (browser, server, admin) |
| Database | Supabase | PostgreSQL schema with row-level security |

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

    User "1" --> "1" Profile : has
    User "1" --> "0..*" CollectionItem : owns
    User "1" --> "0..*" ProductPurchase : owns
    User "1" --> "0..*" Watchlist : watches
    Card "1" --> "0..*" CollectionItem : describes
    CollectionItem "0..*" --> "0..1" ProductPurchase : pulled from
    CollectionItem "1" --> "0..*" Watchlist : tracked by
```

---

## 5. Authentication Flow

```mermaid
sequenceDiagram
    actor User
    participant App as Next.js App
    participant Auth as Supabase Auth

    User->>App: Submit login form
    App->>Auth: signInWithPassword()
    Auth-->>App: session tokens
    App-->>User: redirect to dashboard

    User->>App: Visit protected page
    App->>Auth: getUser() via SSR client
    Auth-->>App: authenticated user
    App-->>User: render page
```

---

## 6. Add Card Data Flow

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
    Page->>DB: INSERT INTO cards
    Page->>DB: INSERT INTO collection_items
    DB-->>Page: success
    Page-->>User: redirect to inventory
```

---

## 7. Key Design Patterns

### Polymorphic Game Support
`CardSearchProvider` and `RaritySystem` are abstract base classes. Adding a new game (e.g. Magic: The Gathering) requires only implementing these two classes and registering the provider in `lib/search/index.ts`. No existing pages or components need to change.

### Server vs Client Components
Server Components (layouts, page data fetching) use the SSR Supabase client from `utils/supabase/server.ts`. Client Components (forms, interactive UI) use the browser client from `utils/supabase/client.ts`. Authentication state is shared via cookies, keeping the session consistent across both environments.

### Row-Level Security
All database tables enforce RLS policies in Supabase. Users can only read and write their own `collection_items`, `product_purchases`, and `watchlist` entries. Marketplace listings are readable by all authenticated users but writable only by the owner.

### Marketplace via Flags
There is no separate listings table. Cards and products are published to the marketplace by toggling `for_sale` or `for_trade` flags on `collection_items` and `product_purchases`. This keeps the data model simple and ensures inventory and marketplace are always in sync.
