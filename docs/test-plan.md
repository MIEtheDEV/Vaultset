# Vaultset — Test Plan

## 1. Purpose

This document defines the test plan for Vaultset. It covers unit testing of the game abstraction layer and end-to-end testing of core user flows. Tests are mapped to acceptance criteria defined in the product backlog.

**Iteration 1** (complete): Auth, collection CRUD, game abstraction layer.  
**Iteration 2** (complete, automated tests pending): Messaging, profiles, city, wishlist, wishlist matching, marketplace enhancements.

---

## 2. Scope

| Layer | Tool | Target |
|---|---|---|
| Unit | Jest + TypeScript | `lib/rarity/`, `lib/search/` |
| End-to-End | Playwright (Chromium) | Auth flows, collection CRUD |
| Manual QA | Browser | All features, each iteration |

Features built in Iteration 2 (messaging, wishlist, profiles) have been manually verified but do not yet have automated E2E test coverage. Automated tests for these features are planned for Iteration 3.

---

## 3. Test Environment

| Item | Value |
|---|---|
| OS | Windows 11 |
| Node.js | v18+ |
| Package manager | pnpm |
| Browser (E2E) | Chromium (via Playwright) |
| Database | Supabase (cloud, free tier) |
| Dev server | `pnpm dev` → localhost:3000 |
| E2E teardown | Automatic — `e2e/global-teardown.ts` deletes all `collection_items` for the test account after each run |

---

## 4. Unit Test Plan

Unit tests run in isolation with no network calls or database connections. They target pure logic in the game abstraction layer.

### Suite 1 — PokemonRaritySystem (`__tests__/lib/rarity/PokemonRaritySystem.test.ts`)

| ID | Test Case | Description | Expected Outcome |
|---|---|---|---|
| U-01 | game identifier | `game` property returns correct string | `"pokemon"` |
| U-02 | getVariantInfo — hyper_rare | Returns correct variant and finish | `variantKey: "gold_card"`, `finishKey: "gold_etched"` |
| U-03 | getVariantInfo — double_rare | Returns correct variant and finish | `variantKey: "standard_ex"`, `finishKey: "holofoil"` |
| U-04 | getVariantInfo — ultra_rare | Returns correct variant and finish | `variantKey: "full_art"`, `finishKey: "textured_holofoil"` |
| U-05 | getVariantInfo — special_illustration_rare | Returns correct variant and finish | `variantKey: "special_illustration_rare"`, `finishKey: "textured_holofoil"` |
| U-06 | getVariantInfo — common | Returns null (finish is user-selectable) | `null` |
| U-07 | getVariantInfo — uncommon | Returns null | `null` |
| U-08 | getVariantInfo — rare | Returns null | `null` |
| U-09 | getVariantInfo — unknown | Returns null for unrecognised key | `null` |
| U-10 | getSortOrder — hyper_rare | Highest priority | `0` |
| U-11 | getSortOrder — common | Lowest priority | `15` |
| U-12 | getSortOrder — unknown | Falls back to lowest | `999` |
| U-13 | getSortOrder — relative ordering | hyper_rare > special_illustration_rare | sort value is lower |
| U-14 | getSortOrder — relative ordering | special_illustration_rare > illustration_rare | sort value is lower |
| U-15 | getSortOrder — relative ordering | illustration_rare > common | sort value is lower |
| U-16 | getDisplayLabel — common | Human-readable label | `"Common"` |
| U-17 | getDisplayLabel — hyper_rare | Human-readable label | `"Mega Hyper Rare"` |
| U-18 | getDisplayLabel — double_rare | Human-readable label | `"Double Rare"` |
| U-19 | getDisplayLabel — special_illustration_rare | Human-readable label | `"Special Illustration Rare"` |
| U-20 | getDisplayLabel — unknown | Falls back to the key itself | key string returned unchanged |
| U-21 | isFinishLocked — fixed rarities | Returns true for rarities with a fixed finish | `true` |
| U-22 | isFinishLocked — common | User selects finish | `false` |
| U-23 | isFinishLocked — uncommon | User selects finish | `false` |
| U-24 | isFinishLocked — rare | User selects finish | `false` |
| U-25 | getRarityOptions — group count | Returns exactly two groups | length `2` |
| U-26 | getRarityOptions — modern group | First group is Scarlet & Violet era | group name contains `"Scarlet & Violet"` |
| U-27 | getRarityOptions — legacy group | Second group is legacy era | group name contains `"Legacy"` |
| U-28 | getRarityOptions — option integrity | All options have value and label | no empty strings |
| U-29 | getRarityOptions — modern contains hyper_rare | hyper_rare present in modern group | value found |
| U-30 | getRarityOptions — legacy contains rare_holo_vmax | rare_holo_vmax present in legacy group | value found |

### Suite 2 — PokemonTCGProvider (`__tests__/lib/search/PokemonTCGProvider.test.ts`)

| ID | Test Case | Description | Expected Outcome |
|---|---|---|---|
| U-31 | game identifier | `game` property | `"pokemon"` |
| U-32 | mapRarity — basic | Maps common, uncommon, rare | correct internal keys |
| U-33 | mapRarity — modern | Maps all Scarlet & Violet rarities | correct internal keys |
| U-34 | mapRarity — legacy | Maps all Sword & Shield / Sun & Moon rarities | correct internal keys |
| U-35 | mapRarity — case insensitive | Accepts mixed case input | consistent output |
| U-36 | mapRarity — hyper rare aliases | Both `"hyper rare"` and `"mega hyper rare"` map to same key | `"hyper_rare"` |
| U-37 | mapRarity — unknown | Returns empty string for unrecognised input | `""` |

### Suite 3 — Search Provider Registry (`__tests__/lib/search/index.test.ts`)

| ID | Test Case | Description | Expected Outcome |
|---|---|---|---|
| U-38 | getSearchProvider — pokemon | Returns correct provider for known game | instance of `PokemonTCGProvider` |
| U-39 | getSearchProvider — fallback | Returns pokemon provider for unknown game | instance of `PokemonTCGProvider` |
| U-40 | getSearchProvider — singleton | Returns same instance on repeated calls | strict equality (`===`) |

---

## 5. End-to-End Test Plan

E2E tests run against the live dev server using a pre-existing test account. They simulate real user journeys and validate the acceptance criteria for Sprint 1 (Authentication) and Sprint 2 (Collection Management).

### Suite 4 — Authentication (`e2e/auth.spec.ts`)

| ID | Test Case | Acceptance Criterion | Steps | Expected Outcome |
|---|---|---|---|---|
| E-01 | Registration page renders | UI is accessible | Navigate to `/register` | Heading, inputs, and submit button visible |
| E-02 | Duplicate email rejected | AC: duplicate email rejected | Submit form with existing email | Error message displayed |
| E-03 | Duplicate username rejected | AC: duplicate email rejected | Submit form with existing username | "This username is already taken." |
| E-04 | Login page renders | UI is accessible | Navigate to `/login` | Heading, inputs, and submit button visible |
| E-05 | Incorrect credentials rejected | AC: incorrect credentials rejected | Submit wrong email/password | Error message displayed |
| E-06 | Correct credentials accepted | AC: login with correct credentials | Submit valid credentials | Redirected to `/dashboard` |
| E-07 | Session persists on refresh | AC: session persists across page refresh | Login, then reload page | Still on dashboard, username visible |
| E-08 | Protected route redirects | AC: unauthenticated access blocked | Visit `/dashboard` without login | Redirected to `/login` |

### Suite 5 — Collection Management (`e2e/collection.spec.ts`)

| ID | Test Case | Acceptance Criterion | Steps | Expected Outcome |
|---|---|---|---|---|
| E-09 | Inventory page loads | UI is accessible | Navigate to `/inventory` | Heading and Add Card button visible |
| E-10 | Card search returns results | AC: TCGPlayer search returns relevant results | Type "Charizard" in search field | Dropdown results appear |
| E-11 | Search pre-populates form | AC: form pre-populated from selected result | Select a result from search | Card name field populated |
| E-12 | Add card (required fields only) | AC: save a card with required fields | Enter name, select condition, submit | Redirected to inventory |
| E-13 | Add card (all fields) | AC: save a card with all fields | Enter all fields, submit | Redirected to inventory |
| E-14 | Card appears in grid | AC: card visible in collection grid | Add a card, check inventory | Card name visible in grid |
| E-15 | Edit card and save | AC: editing a card persists changes | Add card, edit notes, save | Redirected to inventory |
| E-16 | Delete card from grid | AC: deleting removes card from grid | Add card, click Remove, confirm | Card no longer visible |

### Suite 6 — Inventory Filter and Sort (`e2e/inventory-filter-sort.spec.ts`)

| ID | Test Case | Acceptance Criterion | Steps | Expected Outcome |
|---|---|---|---|---|
| E-17 | Search filters by name | Filter/sort controls produce correct output | Add two cards, search for one by name | Matching card visible, non-matching card hidden |
| E-18 | Clear search restores grid | Filter/sort controls produce correct output | Search for a card, then clear the input | Both cards visible again |
| E-19 | Name A–Z sort | Filter/sort controls produce correct output | Add two cards, apply Name A–Z sort | Cards ordered alphabetically ascending |
| E-20 | Name Z–A sort | Filter/sort controls produce correct output | Add two cards, apply Name Z–A sort | Cards ordered alphabetically descending |
| E-21 | Search empty state | Filter/sort controls produce correct output | Search for a string that matches no cards | "No cards found for…" message visible |
| E-22 | Filter empty state | Filter/sort controls produce correct output | Add ungraded card, apply Graded filter | "No cards match this filter." message visible |

---

## 6. Screenshot Checklist

The following screenshots should be captured and attached to the test results document:

| # | What to capture | How |
|---|---|---|
| S-01 | Jest passing — all 40 unit tests | Run `pnpm test` in terminal, screenshot the output |
| S-02 | Playwright UI — all tests listed | Run `pnpm exec playwright test --ui`, screenshot the test list |
| S-03 | Playwright UI — passing tests | Screenshot after a full passing run |
| S-04 | Playwright UI — individual test trace | Click any passing E2E test and screenshot the trace timeline |

---

## 7. Planned Test Suites — Iteration 2 (not yet automated)

These suites cover features built in Iteration 2 and are targeted for Playwright automation in Iteration 3.

### Suite 7 — Messaging (`e2e/messaging.spec.ts`)

| ID | Test Case | Steps | Expected Outcome |
|---|---|---|---|
| E-23 | Inbox loads | Navigate to `/messages` | Conversation list visible |
| E-24 | Start conversation from listing | Click Contact Seller on a listing | Thread opens with listing context card |
| E-25 | Start conversation from profile | Click Message on a profile | Thread opens |
| E-26 | Send a message | Type and submit in thread | Message appears in thread |
| E-27 | Unread badge | Receive a message | Gold badge appears on nav Messages link |
| E-28 | Mark read on open | Open thread with unread messages | Badge clears |

### Suite 8 — Wishlist (`e2e/wishlist.spec.ts`)

| ID | Test Case | Steps | Expected Outcome |
|---|---|---|---|
| E-29 | Add card to wishlist | `/wishlist/add`, search, select, save | Card appears in wishlist grid |
| E-30 | Duplicate rejected | Add same card twice | Friendly "already on your wishlist" error |
| E-31 | Remove from wishlist | Click Remove button | Card removed from grid |
| E-32 | Wishlist visible on profile | Visit own profile | Wishlist tab present with correct count |
| E-33 | Available Now on dashboard | Wishlist card is listed by another user | Available Now widget shows on dashboard |
| E-34 | Wanted badge in marketplace | Wishlist card appears in marketplace | ★ Wanted badge visible on card |
| E-35 | Wanted filter | Click ★ Wanted filter pill | Only wishlist-matching listings shown |

### Suite 9 — Profiles & Account (`e2e/profiles.spec.ts`)

| ID | Test Case | Steps | Expected Outcome |
|---|---|---|---|
| E-36 | Profile loads | Navigate to `/profile/[username]` | Avatar, username, bio visible |
| E-37 | City shown on profile | Set city in Account, view profile | City and pin icon visible |
| E-38 | City shown in community | Set city, view Community page | City visible under username |
| E-39 | Profile tabs | Click Listings / Collection / Wishlist tabs | Correct content loads per tab |
| E-40 | Avatar color update | Change avatar color in Account | New color shown on profile and nav |

---

## 8. Pass/Fail Criteria

A sprint is considered closed when:
- All unit tests pass (`pnpm test` exits 0)
- All automated E2E tests pass (`pnpm exec playwright test` exits 0)
- Each user story has been manually stepped through in the browser and marked pass
- Any failing story is returned to the backlog before the sprint closes
