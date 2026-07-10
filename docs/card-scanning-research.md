# Card Scanning — Research & Feasibility

**Status:** **Overhauled to perceptual-hash image matching (2026-07-09)** — the OCR
text-fingerprint pipeline below is retired. · **Last updated:** 2026-07-09

> **Implementation (2026-07-09, current):** the OCR pipeline shipped 2026-07-05 failed in the real
> world (74 scans: 35% confident, 24% zero results, several confidently WRONG — tesseract on phone
> photos emits garbage no matcher can recover). Replaced end-to-end with **perceptual-hash image
> matching**, validated on the 52 stored real user scans at **52/52 top-1 exact printing** before
> shipping. Flow: `components/CardScanner.tsx` (capture) → crop + perspective warp
> (`components/CardCropper.tsx` + `lib/scan/perspective.ts`, unchanged — the warp is what makes
> hashing work) → **client computes dHash-256 + pHash-64 on-device from canvas pixels**
> (`lib/scan/perceptualHash.ts`, isomorphic pure-JS, no native deps) → `POST /api/card-scan` with
> the hex hashes → server does a **pure-JS hamming compare** (`lib/scan/hashIndex.ts`,
> `matchHashes`) against a prebuilt index of every known card image (`scripts/build-scan-index.ts`
> → `scan-index/index.json.gz` in Supabase Storage; sources: pokemontcg.io catalog + TCGdex gap
> sets + TCGplayer images from our `cards` table for promos like MEP that pokemontcg.io lacks) →
> confidence gate (distance ≤125, margin ≥10 vs any different-named card) → candidate tie-set → tap
> → `handlePokemonSelect`. Low-confidence falls back to manual name+number lookup
> (`lib/scan/matchScan.ts`). **`sharp` is NOT on the request path** — it fails to load libvips on
> Vercel's Lambda runtime, so hashing moved to the browser; `sharp` lives only in
> `lib/scan/imageHash.ts` (node-only), used by the offline index builder + replay. $0 per scan; no
> OCR; tesseract.js removed. **Regression harness:** `pnpm scan:replay` replays the labeled
> real-photo corpus (`scripts/scan-ground-truth.json`) through the exact production matcher (same
> isomorphic hasher) — run after any matcher change; confidently-wrong results are a hard fail.
> Changing the hash algorithm requires a full index rebuild (`pnpm scan:index --full`) so client
> and index hashes match.
>
> Everything below this line is the historical research + the OCR experiment record.

Exploration of a "scan your card" feature: point a camera at a physical card and add it to
inventory instead of typing a search. This doc captures the provider landscape, two measured OCR
prototypes, and a recommended architecture. No code has been added to the app.

> **Headline update (2026-07-05):** the print *number* is the wrong thing to OCR (tiny, thin,
> low-contrast — see §3). The right thing is the card's high-contrast **body text** (name, attack
> names, HP), then **fingerprint-match** it against the card DB. A second prototype (§4) measured
> **5/5 correct card identity — including both modern cards the number-OCR prototype couldn't
> read.** This is now the recommended Tier-1 approach (§5).

---

## 1. How it fits the existing architecture

Scanning is fundamentally an **identification** problem whose output is the same
`SearchResult[]` that search already produces. Everything downstream is reused unchanged:

```
photo → [identify] → SearchResult[] → handlePokemonSelect → performSave
                                       (writes `cards` + `collection_items`, price backfill)
```

So the only genuinely new pieces are: (1) camera capture UI, (2) an identify step, (3) a
confirmation UI (which can reuse the existing results dropdown).

The natural home for the identify step, following the existing polymorphic pattern:

- Add `identifyFromImage(image): Promise<SearchResult[]>` to the `CardSearchProvider` abstract
  class (`lib/search/`), implemented per game.
- A `getScanProviders()` cascade factory mirroring `getPriceProviders()` (`lib/pricing/`) —
  returns only configured tiers, in order, budget-guarded via the `price_api_usage` table pattern.
- Reuse the existing number-anchored ranking: `search(q, { set, number })` already boosts an exact
  normalized-number match by +1000, and `normalizeCardNumber` makes `067` == `67` == `67/191`.

---

## 2. Provider landscape

| Provider | Public dev API? | Free tier | Notes |
|---|---|---|---|
| **Ximilar** `tcg_id` | ✅ documented | 1,000 credits/mo, no CC | **A TCG ID = 10 credits → ~100 scans/mo free.** Returns name, set, set code, number, game, year, rarity, foil/holo, TCGplayer/eBay/PSA links, slab grade. `POST /collectibles/v2/tcg_id`, accepts `_url` or `_base64`. Paid: Business 100K credits €59/mo ≈ 10k scans (~$0.006/scan). |
| **Google Cloud Vision** | ✅ | 1,000 OCR units/mo (non-expiring), then ~$1.50/1k | OCR only — reads text, we map it to a card. |
| **AWS Rekognition / Azure Vision** | ✅ | per-vendor free OCR tiers | OCR only; more free tiers to stack. |
| **Tesseract.js** | n/a (library) | free, unlimited | Client-side OCR, $0 at any volume. |
| Ludex / CollX / Collectr / CardGrader | ❌ | — | Consumer scanner apps, no public API. |
| TCGSync | ⚠️ B2B, undocumented | — | Contact-only; investigate later if needed. |

**On "exhaust free tiers across multiple APIs" (like the pricing pipeline):** for *identification*
the market is thin — Ximilar is effectively the only card-ID API, so you can't stack multiple
card-ID vendors the way you stack price vendors. The legitimate multi-tier version here is:
(a) stack *different OCR vendors'* free tiers at the OCR layer, and (b) split the cascade by
**difficulty** (free OCR first, paid ID only on low-confidence) rather than by vendor.
Rotating multiple free accounts at one vendor violates ToS — don't.

---

## 3. OCR prototype — measured results

A standalone prototype (Tesseract.js) was run against 5 real cards pulled from pokemontcg.io,
scored against ground truth. **These are clean official scans = OCR best case; real phone photos
(glare/angle/foil) will be worse.** Three escalating passes were tried: full image, cropped +
upscaled bottom strip, and targeted corners with a digit-only whitelist + thresholding.

| Card | Era | Name | Number | Resolvable? |
|---|---|---|---|---|
| Charizard 4/102 | Vintage (1999) | ✅ | ✅ `4/102` | ✅ |
| Blastoise 2/102 | Vintage | ✅ | ✅ `2/102` | ✅ |
| Pikachu 58/102 | Vintage | ✅ | ✅ (needed crop) | ✅ |
| Gardevoir ex 86/198 | Modern (SV) | ✅ | ❌ misread `86`→`056` | ❌ |
| Mew ex 151/165 | Modern (151) | ✅ | ❌ nothing | ❌ |

**Name: 5/5 (100%). Number: 2/5 raw → 3/5 with preprocessing. Fully resolvable: 3/5.**

### Findings

1. **Card names OCR trivially well (100%, all eras)** — the large title text is easy.
2. **Numbers split by era:** vintage 100%; **modern Scarlet & Violet effectively unreadable** even
   after aggressive preprocessing. Modern numbers are a tiny, thin, low-contrast font over artwork.
3. **The dangerous failure is a confident wrong read** (Gardevoir `86`→`056`). A wrong number
   silently attaches the wrong card — worse than "not found." Any implementation must
   confidence-gate: require the `/total` to match the set's known print count, and require name
   **and** number to resolve to the *same* card (the "confident-or-nothing" philosophy already used
   in the pricing pipeline's `bestMatch`).
4. Best case only — modern cards that fail on clean scans will fail harder on phone photos.

> **The takeaway that reframes the whole feature:** stop OCR'ing the number. The number is the
> single *worst* thing on the card to read. The name, attack names, and HP live in large,
> high-contrast text and OCR reliably across every era — and together they identify the card. §4
> measures this directly.

---

## 4. Text-fingerprint identification — the primary signal

Instead of reading the number, read the card's **body text** and match it against the card DB.
Two nested problems, and this separates them cleanly:

1. **Card identity** — *which card is this* (name + attacks/abilities + HP). Body text nails this.
2. **Printing identity** — *which set/number/variant*. Body text **can't** fully fix this alone,
   because the same card is reprinted across sets with byte-identical attack text. But it collapses
   the candidate list from "everything" to "this card's few reprints," where a set-symbol/number/tap
   finishes the job.

**Why body text beats the number:** attack names, HP, and the Pokémon name sit in large,
high-contrast text (black-on-white text boxes, big title font). They OCR reliably across every era,
and they're *information-rich* — a garbled character (`Explosve Vortx`) still fuzzy-matches
`Explosive Vortex`, whereas one wrong digit silently ruins a 3-digit number.

**We already have the data and a query surface.** `PokemonCardDetail` (`lib/search/PokemonTCGProvider.ts`)
already ingests `hp`, `attacks[]` (name/cost/damage/text), `abilities[]`, `flavorText`, `artist`.
And pokemontcg.io's Lucene API queries those fields directly — `attacks.name:"Fire Spin"`,
`attacks.text:"…"`, `abilities.name:"…"`, `hp:120`, `artist:"…"`. Two viable implementations:
query-time (union `name:`/`attacks.name:` queries, then rank), or a local precomputed fingerprint
index for offline fuzzy match.

### Prototype 2 — measured results (2026-07-05)

Tesseract.js on the **same 5 cards** as §3, scored two ways. `sv1-86` (Gardevoir ex) and
`sv3pt5-151` (Mew ex) are the two modern cards whose **numbers were unreadable** in §3.

**(A) Signal presence** — is the fingerprint actually readable by OCR?

| | name | attacks | HP |
|---|---|---|---|
| **Readable** | **5/5** | **5/5** (every attack on every card) | **4/5** |

**(B) End-to-end resolution** — from OCR output only (no ground-truth peeking): extract name
candidates (anchored on the HP line, which carries the name in every era), union `name:<cand>*`
queries, rank by attack-name + HP matches.

| Card | Era | Retrieved pool | Correct **card** (name+attacks)? | Exact printing? | Identical-text reprints left |
|---|---|---|---|---|---|
| Charizard 4 | Vintage | 109 | ✅ | ✗ | 6 |
| Blastoise 2 | Vintage | 47 | ✅ | ✗ | 3 |
| Pikachu 58 | Vintage | 209 | ✅ | ✗ | 4 |
| Gardevoir ex 86 | Modern (SV) | 58 | ✅ | ✅ | 6 |
| Mew ex 151 | Modern (151) | 136 | ✅ | ✅ | 6 |

**Correct card identity: 5/5, including both modern cards §3 couldn't touch.** Exact printing was
2/5 — and honestly those two landed by tie-break luck; the real result is the last column: text
narrows 47–209 candidates down to **3–6 identical-text reprints**, and a set-symbol/number/one-tap
finishes it.

### Findings
1. **Identity is a solved problem with free OCR.** Name + attack names + HP fingerprint the card
   reliably, every era. This is the core unlock.
2. **The number was never the right target.** The two cards that were *unresolvable* in §3 are
   *fully resolved to the correct card* here.
3. **The residual is genuine reprints, not OCR error.** Text can't separate a Base-Set Charizard
   from its identical-text reprints — that's inherent, and it's a small tie-set (3–6), perfect for a
   one-tap confirm or a set-symbol tiebreak. Don't oversell "exact printing" from text alone.
4. **Same confidence-gate philosophy applies:** auto-add only when the fingerprint resolves to a
   single identity; otherwise present the tie-set. Never guess a printing.

**Rebuts the §5 "no cache-by-key" caveat:** each *photo* is uncacheable, but the *card database* is
static and fully indexable. The identify step can be offline and nearly free — a local fingerprint
index, no per-scan API call required.

### Can artist / set symbol / year close the printing gap? (measured 2026-07-05)

Prototype 2 was extended to test every remaining text signal that could break a reprint tie.

**(C) Auxiliary-signal readability by OCR:**

| Signal | Readable | Reprint value |
|---|---|---|
| **Artist name** | **4/5** (missed only "aky CG Works") | Weak — the *same art is reused* across most reprints, so artist confirms *identity*, it rarely separates *printings* |
| Copyright **year** | 1/5 | Would be strong (differs per reprint) — but unreadable |
| **Set total** (`/198`) | 2/5 (both vintage `/102` only) | Would be strong — but unreadable |
| **Reg-mark** (`G`) | 0/2 | Weak anyway (single tiny glyph) |
| **Set symbol** | **n/a — not text** | Strong, but a glyph; OCR cannot read it (image-classification problem) |

**(D) Layering year + set-total into the match** shrank the reprint tie-set **avg 5.0 → 3.0** and
resolved exact printing on **2/5** (the vintage cards where `/102` read). It caps there.

**The honest ceiling:** the text signals that *would* disambiguate reprints (year, set-total,
reg-mark) live in the **same tiny, low-contrast bottom zone as the number** that §3 proved OCRs
badly. **You cannot OCR your way out of the reprint ambiguity.** Artist is the one pleasant surprise
(4/5) but it mostly corroborates identity. So single-still OCR maxes out at: **identity 5/5, printing
= a 3–6 card tie-set, occasionally narrowed.**

### Set-symbol matching — measured (Prototype 3, 2026-07-05)

The set symbol is a *glyph, not text*, so it can't be OCR'd — matching it is an image task. Tested
against all 173 pokemontcg.io `set.images.symbol` references. **Verdict: promising as a tie-set
disambiguator, but not a quick win — segmentation is the blocker.**

- **Feasibility gate (symbol vs symbol):** set symbols are **not globally unique** — ~half (93/173)
  have a near-identical (IoU≥0.90) other set, and some are *literally the same glyph* (every "Black
  Star Promos" set shares one symbol). So it can't be a *global* set classifier. **But within a
  card's actual reprint tie-set** the candidate sets usually span different eras with distinct
  symbols (Charizard's reprints: nearly all pairs IoU<0.75) — so it *can* disambiguate the small
  tie-set the text fingerprint hands it.
- **End-to-end crop → match (2 cards):** the `sv3pt5` "MEW" text-badge symbol matched well (correct
  set #3/173, **top-1 within its tie-set ✓**); the `xy1` wedge glyph on busy holo art **failed**
  (correct set #108/173) — the crop was swamped by artwork/sparkle clutter (IoU ~0.2 even when
  correct).
- **Real blocker = localization + segmentation.** The symbol's position and nature vary by era
  (XY glyph bottom-right, SV a *text badge* bottom-left, older icons vary), and cutting a clean
  tiny glyph out of holo clutter defeats naive CV. Reliable automated matching needs a trained
  symbol detector/embedding, not hand-rolled silhouette IoU. *(Aside: several modern "symbols" are
  actually text — e.g. the 151 set's "MEW" badge — so a hybrid OCR+shape read is possible there.)*

### Reliability roadmap — closing the printing gap

Ranked by leverage-per-effort, updated with the set-symbol measurements:

1. **One-tap confirm over the tie-set (ship this).** The pragmatic, ~100%-reliable closer: show the
   3–6 reprints **with their set symbols + set names** and let the user tap. The symbol is distinct
   within the tie-set and the *human eye* reads it instantly even where automated CV can't. Cheap,
   robust, and it turns the hard part into a one-tap.
2. **Multi-frame capture voting.** A phone gives ~30 frames/sec, not one still. Majority-voting OCR
   tokens across frames lifts the flaky tiny-text signals (year/total/number/reg-mark) that fail on
   a single frame. Real upside the single-still prototypes can't measure.
3. **Artist as an identity cross-check.** Free, 4/5 readable. Won't break reprint ties but raises
   confidence and catches a wrong-name misread. Cheap to add to the ranking.
4. **Automated set-symbol matching (higher effort).** Worthwhile to reduce taps, but needs a trained
   detector/embedding to survive holo clutter — not the hand-rolled version tested here. Constrain
   it to the tie-set (where symbols are distinct), not global.
5. **Ximilar (Tier 2)** for the genuine residue (stylized full-arts, non-English, textless energy).

The recommended reliable stack is **text-fingerprint (identity) → one-tap over the symbol-labelled
tie-set (printing) → Ximilar (residue)** — with multi-frame voting and, later, automated symbol
matching as reliability upgrades. OCR does identity; the human (or, later, a trained model) picks
the printing off the symbol; the paid tier stays an exception.

---

## 5. Recommended design (two tiers)

The line is sharper than "free OCR vs paid API" — it's **free text-fingerprint ID for identity,
paid exact-ID only for the hard residue:**

- **Tier 1 — free, ships today: text-fingerprint auto-ID.** OCR name + attack names + HP →
  fingerprint-match against the card DB (§4). Resolves the card **identity** on 100% of tested cards,
  every era, $0 API cost. Confidence-gated: single identity → auto-add; a small reprint tie-set →
  one-tap pick (still far better than typing); low confidence → fall back to name-prefilled search.
- **Tier 2 — Ximilar, confidence-gated: exact printing.** Spend a credit only when a
  no-disambiguation exact-printing add is wanted and Tier 1 left a tie-set or came back
  low-confidence (stylized full-arts, non-English, textless energy cards). ~100 free scans/month
  goes far when it's the exception, not the default.

### Caveats vs. the pricing pipeline
- **Cache the DB, not the photo.** Every scan is a different image, so the *identify call* can't be
  cached — but the *card fingerprint index* is static and cacheable (see §4). Keep Tier 1 offline
  where possible.
- **Budget guard still applies** — cap the Ximilar tier (e.g. ~100/day) via the `price_api_usage`
  pattern so the free ceiling is never accidentally blown.

---

## 6. Open questions / next steps (when picked up)

- Measure the **real-world** hit rate on actual phone photos (both prototypes only prove the clean-scan best case).
- **Reprint tie-break (measured, §4):** OCR *cannot* reliably read the disambiguating text (year 1/5, set-total 2/5, reg-mark 0/2), and naive set-symbol matching is blocked by segmentation (§4, Prototype 3). Ship the **one-tap confirm over the symbol-labelled tie-set** first; artist (4/5) is a confidence cross-check.
- **Automated set-symbol matching (higher effort):** proven distinct within a tie-set but needs a trained detector/embedding to survive holo clutter — the hand-rolled silhouette-IoU version failed on busy artwork (xy1 #108/173). Constrain to the tie-set, not global (symbols aren't globally unique — 93/173 have a near-twin).
- **Multi-frame capture voting:** a video scan gives ~30 frames; majority-vote OCR tokens to lift the flaky tiny-text signals. Untestable on a single still — measure the real lift.
- **Trainer / Energy / full-art coverage:** the prototype tested Pokémon cards; measure Trainer (rules text — should work), Energy (little text — weak), and stylized full-arts.
- Camera capture UX: card-shaped crop guide, perspective correction — the main net-new UI work.
- Decide Tier-1 OCR host: Tesseract.js (client-side, $0, unlimited) vs Google Vision (more accurate, 1k free/mo then paid).
- Build the local fingerprint index vs. query-time pokemontcg.io Lucene queries — measure latency/accuracy tradeoff.

**Prototypes** live outside the repo in the scratchpad, re-runnable against custom images; throwaway
measurement tools, not committed:
- `ocr-prototype/run.mjs` — §3, number-focused OCR.
- `text-fingerprint-prototype/run.mjs` — §4, body-text fingerprinting + aux signals (`npm install && node run.mjs`).
- `set-symbol-prototype/` — §4, set-symbol matching: `distinct.mjs` (symbol distinctiveness) + `match.mjs` (crop→match).
