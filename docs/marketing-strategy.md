# Vaultset — Marketing & Monetization Strategy

> **Source:** Monetization appraisal prepared 2026-06-22 by a 3-agent research team
> (competitive benchmark · codebase paywall audit · collector jobs-to-be-done research),
> synthesized into the strategic read below.
> **Companion docs:** monetization *tactics* and the Free/Pro reference table live in
> [`../TODO.md`](../TODO.md); SEO/go-to-market mechanics live in [`docs.md`](./docs.md).

---

## Verdict

**The strategy is well-designed and quietly giving itself away.** The gating *philosophy*
matches the model that took the closest competitor to eight-figure ARR — but the gates
don't hold, the moat already built isn't in the marketing, and one feature is being sold
that doesn't exist yet.

| Dimension | Grade |
|---|---|
| Gating philosophy | 9 / 10 |
| Differentiation (moat built) | 8 / 10 |
| Pricing structure | 6 / 10 |
| Paywall enforcement | 4 / 10 |
| **Overall** | **7.0 — right model, leaking** |

---

## 1. Executive read — four things are true at once

1. **Instincts are correct.** We gate *insight* (analytics, price history, export, alerts)
   and keep *cataloging* unlimited and free. That is exactly what category leaders do and
   what collectors say they'll pay for. Apps that cap collection size instead (Ludex's
   60-card limit, Collectr's ~35-card free cap) generate the loudest paywall resentment in
   their reviews.
2. **But the paywall is porous.** Free users can already trigger the most expensive Pro
   feature directly — and it spends our paid pricing-API budget while they do it. Paying
   users, meanwhile, don't actually receive the "unlimited refresh" they bought. The
   conversion math is currently fiction. *(See §3.)*
3. **We're sitting on the moat the whole category is missing.** Every competing tool
   inherits a flawed price feed; collectors complain about it constantly. Our engine
   already produces real per-condition and per-grade transaction prices. We built the
   answer and filed it under plumbing. *(See §4.)*
4. **We're missing the category's #1 funnel.** Scanning is the single biggest driver of
   paid conversion elsewhere — and it's on our backlog. That's the natural home for our
   first freemium meter. *(See §5.)*

---

## 2. The tier map — what stands today

**Keep this shape.** Gating insight rather than storage is the validated path; don't add
card caps to manufacture upgrades. The work isn't redesigning the tiers — it's making the
freemium column actually enforce, and making Pro deliver what it promises.

### Free (Common)
Unlimited inventory & sealed products · current market value on every card · full
buy/sell/trade & offers · unlimited marketplace listings · wishlist & price alerts · pack
reveals, collections, storefronts · bulk CSV **import**.

### Freemium (Uncommon) — basic for all, Pro unlocks the full version
- **Market refresh** — daily auto vs. on-demand
- **Listing pause** — instant toggle vs. scheduled + auto-reply
- **Alerts** — standard vs. "instant" delivery
- **Showcase** — basic vs. foil / gold borders

### Pro (Rare) — no free version
- Price history charts (7D–All)
- Portfolio analytics & ROI
- Bulk CSV **export** (tax / insurance)
- Foil & holo showcase borders
- Pro Seller badge (subscribers only)

---

## 3. Risk register — the paywall leaks both ways

Fix pattern for all four: re-check `hasProAccess()` **server-side** in the route / server
action, and add `showcase_border` + `vacation_*` to the protected-columns DB trigger.
Until these hold, no pricing change moves the needle.

> **Status (2026-06-22):** C1–C4 are addressed on branch `fix/paywall-enforcement`
> (server-side refresh gates + the VS-3 protected-columns trigger applied to the DB);
> pending PR/merge and regression tests. Confirm before treating as closed.

| # | Severity | Issue |
|---|---|---|
| **C1** | Critical | **Per-item refresh is completely ungated.** `refreshItemMarketValue` has no Pro check and no rate limit. A free user can loop it across every card for unlimited on-demand pricing — and it spends our paid pricing-API budget. We're funding the exact feature we're trying to sell. |
| **C2** | Critical | **Bulk refresh route has no Pro gate — and Pro's promise is unbuilt.** `/api/market-refresh` applies the same 24h limit to everyone with no tier check, so free users get bulk refresh directly. Worse, the advertised "unlimited refresh for Pro" isn't implemented — paying users are capped too. |
| **C3** | High | **Borders & scheduled vacation are client-only gated.** Free users can write `showcase_border: "gold"` or a vacation auto-reply straight from the browser console — the DB trigger that protects `is_pro` didn't cover these columns. |
| **C4** | High | **"Instant alert delivery" is sold but not built.** The push toggle advertises priority delivery to Pro; the dispatch path has zero tier branching. That's a refund/chargeback risk, not just a missing feature — build it or stop selling it. |

---

## 4. The opportunity — we built the moat, now sell it

The clearest unmet need across every paying collector segment is **pricing that reflects
real, net-of-fees, per-condition and per-grade value** — transparently sourced. Every
rival inherits TCGplayer's outlier-skewed "Market Price" or raw eBay noise, and collectors
know it.

Our multi-tier engine, real per-condition prices, and graded slab medians (PSA/BGS/CGC)
already answer this. Two moves turn plumbing into a headline:

- **Surface "what you'd net."** Show market value *minus* typical marketplace fees.
  Collectors want realistic resale value, not a sticker price — and we already have the
  data to compute it. Nobody else shows it.
- **Lead with graded & sealed as first-class.** We model raw, graded, and sealed in one
  portfolio with real slab data — the three highest-willingness-to-pay, most-underserved
  segments. Make *"the most accurate, net-of-fees pricing in TCG — raw, graded, and
  sealed"* the top line of marketing.

> **One honest caveat.** Before marketing "most accurate pricing," confirm coverage: what
> % of a typical collection gets real-time / graded prices vs. ~24h-stale bedrock? Don't
> advertise a moat we can't consistently deliver — perceived price unreliability is a top
> churn trigger.

> **Coverage check — 2026-06-22 (n=27, whole DB; early-stage, directional only).**
> First reading: 85% priced but **real-time 30% · bedrock 56% · missing 15%**, **per-condition 0%**,
> **fresh-<6h 0%**. That reading turned out to be measuring **two production bugs**, not true
> coverage — the pricing pipeline was silently writing nothing.
>
> **Root cause (fixed, merged to `main`):** ① JustTCG batch sent `{items}` instead of a bare array
> → 400, no real-time/per-condition data; ② bedrock put `id:tcg:`/`id:manual:` into a Lucene `OR`
> query → one non-native card 400'd the whole batch, so bedrock wrote nothing either. Both were
> non-OK responses swallowed silently; now routed through `PriceProvider.ensureOk` (warns/throws).
> Bedrock fix **verified on prod data** — 15 cards repriced, cache unfroze.
>
> **Verdict — still capability-framed, pending re-measure.** Don't make the blanket "most accurate
> pricing" headline yet: real numbers are unknown until coverage is re-run on the *fixed* pipeline
> with **fresh JustTCG quota** (free tier 100/day was exhausted during diagnosis). Re-run
> `../supabase/pricing_coverage_check.sql` after reset; watch **per-condition** and **real-time**
> climb. The 100/day ceiling is itself a Step-2 deliverability risk — see §7.

---

## 5. The gap — scanning is the freemium meter waiting to happen

Fast, accurate scanning is the #1 paid-conversion driver across the category — and it's
precisely where Ludex and ManaBox visibly fail (wrong printings, missed Japanese cards).
It's on our backlog, so this is a placement decision, not a build ask.

When scanning ships, it's the natural home for our **first usage-based freemium meter** —
free but capped scans per month, unlimited on Pro. That gives free users a reason to
upgrade that doesn't involve re-gating anything they have today, and it matches how the
whole category funnels. Identify by set / number / finish, not art alone, and we also beat
the incumbents on the accuracy collectors complain about.

---

## 6. Recommended sequence

1. **Now — Seal the paywall.** Close C1–C4. Server-enforce the refresh gates, protect the
   cosmetic columns, resolve "instant alerts" (build it or pull the claim). Stops active
   revenue and API-budget loss and makes every later number real.
   *(In progress on `fix/paywall-enforcement`.)*
2. **Next — Reposition around pricing accuracy.** Make real per-condition / per-grade,
   net-of-fees pricing the headline of the product and the marketing. Ship the "what you'd
   net" number. Lead graded + sealed. Already built; just unsold.
3. **Then — Tighten the Pro lineup.** Move to **annual-primary at ~$60/yr** (category sweet
   spot). Reconsider the one-time 30-day SKU — it creates badge-less Pro users and an
   undisclosed expectation gap. At minimum, disclose the badge difference at checkout.
4. **When scanning ships — Add the scan meter.** Free-but-capped scans become the first
   usage-based upgrade trigger — the category's proven funnel, added without re-gating
   anything free users already rely on.

---

## 7. Devil's advocate — where this could be wrong

- **The moat assumes the data is actually better.** It's architecturally better, but thin
  JustTCG ID-mapping coverage means many cards still fall to stale bedrock. Get the
  coverage number before the marketing claim.
- **The real-time source has a hard quota ceiling.** JustTCG's free tier is **100 requests/day**
  — exhausted in a single afternoon of *diagnosis*, before any user load. The differentiator
  (real-time per-condition/graded prices) depends entirely on it, so at any real scale the cache
  cannot stay fresh on the free tier. Marketing "most accurate pricing" implies a quota budget
  (paid JustTCG tier and/or a cache-warming job for actively-listed cards) that doesn't exist yet.
- **The one-time SKU may be net-negative.** It's an unusual SKU competitors don't offer, it
  complicates the pricing page, and it invites "I paid for Pro, where's my badge?"
  complaints. Question whether it earns its place.
- **Don't add a marketplace take-rate yet.** Marketplace economics are a liquidity play,
  and liquidity is a network-effect moat we don't have as a new entrant. A fee on a thin
  marketplace earns little and kills the liquidity we're building.
- **Repositioning is a promise to keep.** Leading with accuracy raises the bar on accuracy.
  If a user spots an obviously wrong price after that headline, the trust hit is larger
  than if we'd never claimed it.

---

## 8. Open decisions

1. ~~**Scope of the leak fix**~~ — ✅ **Done & merged.** C1–C4 enforced server-side +
   regression tests in `main` (PRs #1/#2). Step 1 of the recommended sequence is complete.
2. ~~**The "instant alerts" claim**~~ — ✅ **Resolved by removal.** The unbuilt priority-delivery
   claim was pulled from `PushToggle` (the one-line copy fix), not sold. Real priority
   delivery remains a deferred roadmap item if we want it later.
3. **The one-time 30-day SKU** — keep and disclose, or retire in favor of annual-primary?
   *(Still open — pricing-page decision.)*
4. **Coverage check** — ▶ **Ready to run.** Query at
   [`../supabase/pricing_coverage_check.sql`](../supabase/pricing_coverage_check.sql) measures
   real-time/graded vs. stale-bedrock coverage on the live collection data. **Decision rule:**
   the "most accurate pricing" headline (Step 2) is safe only if the bedrock-or-missing share
   is low enough that a typical collection mostly shows real-time/graded prices — otherwise
   lead with the *capability* ("net-of-fees, per-grade where available"), not a blanket claim.
