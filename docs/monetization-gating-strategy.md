# Vaultset — Monetization & Feature Gating Strategy

**Status:** Tiers **decided 2026-06-13** and reflected in the pricing page (`app/pricing/page.tsx`), homepage FAQ (`app/page.tsx`), and `TODO.md`. **Refined 2026-06-13 after an external strategic review** — adopted refinements are folded into the tables below; see §7 for provenance and the one rejected proposal. Gating is **not yet enforced in code** — enforcement is the open Phase 4 work.
**Last updated:** 2026-06-13
**Purpose:** Evaluate every shipped feature against marketing/business value and recommend what should be **gated behind Pro**, **limited (freemium)**, **purchasable one-time**, or **always free**.

---

## 1. The core tension

Vaultset has **two revenue engines that pull in opposite directions on gating:**

| Engine | Maximized by | Implication |
|---|---|---|
| **Marketplace transaction fee (2–3% of GMV)** | More listings, more offers, more completed deals, more liquidity | Wants the marketplace **open and frictionless** |
| **Pro subscription (~$4.99/mo)** | Restricting valuable features to paying users | Wants features **gated** |

The transaction fee is the larger long-term engine (it scales with the network and has no per-seat ceiling), and it is also the cheapest to grow because it feeds on activity the users generate themselves. **Therefore, when a gating decision trades subscription revenue against marketplace liquidity, liquidity wins.**

### The decision rule

> **Gate personal-utility features. Never gate network, liquidity, or acquisition features.**

- **Personal-utility** = value accrues to one user and their absence doesn't reduce anyone else's experience or the platform's growth (analytics, history, convenience, cosmetics). → **Safe to gate.**
- **Network / liquidity / acquisition** = value compounds across users, drives GMV, or pulls in new signups via SEO/virality (marketplace, listings, offers, public profiles, community, price alerts). → **Keep free.** Gating these is self-sabotage: you lose more in transaction fees and growth than you gain in subscriptions.

---

## 2. Scoring dimensions

Each feature is rated **Low / Med / High** on:

- **Acquisition** — does it pull in new users (SEO, virality, word-of-mouth, the headline promise)?
- **Retention** — does it bring users back?
- **WTP** — willingness to pay; would a serious collector pay to unlock it?
- **Gating cost** — how much does gating it *hurt* the network/growth? (**High here = do NOT gate**)
- **Serve cost** — infra/API cost to provide (relevant to the near-$0 overhead constraint)

A feature is a good **Pro gate** when **WTP is High and Gating cost is Low**.
A feature must stay **Free** when **Acquisition or Gating cost is High**.

---

## 3. Feature-by-feature evaluation

### 3a. Collection management (the acquisition hero)

| Feature | Acq | Ret | WTP | Gating cost | Serve | Recommendation |
|---|---|---|---|---|---|---|
| Inventory CRUD + TCG search | **High** | High | Low | **High** | Low | 🟢 **Always free — unlimited & uncapped** — storage is *participation*; the Pro lever is **insight** (history/ROI), not a storage wall *(see §7a)*. |
| Sealed product tracking + pull P&L | Med | High | Med | Med | Low | 🟢 **Free** — differentiator vs spreadsheets; deepens engagement. |
| Bulk CSV import | **High** (onboarding) | Low | Med | **High** | Low | 🟢 **Free** *(decided)* — import is the spreadsheet-migration moment; gating it adds friction at activation. |
| **Bulk export (CSV)** | Low | Med | **High** | **Low** | Low | 🔵 **Pro** *(decided)* — power-user/dealer convenience for getting data *out*; gating export costs no acquisition (it isn't an onboarding step) while carrying real WTP. **Tax/insurance presets** sharpen the value prop *(see §7e)*. |
| Bulk edit (select mode) | Low | Med | Low | Low | Low | 🟢 **Free** — table-stakes UX; no one pays for it, gating just annoys. |
| Duplicate detection/merging | Low | Med | Low | Low | Low | 🟢 **Free** — data hygiene; expected. |

### 3b. Market data & valuation (the strongest Pro levers)

| Feature | Acq | Ret | WTP | Gating cost | Serve | Recommendation |
|---|---|---|---|---|---|---|
| Live market prices (current value) | **High** | High | Med | **High** | Med | 🟢 **Free** — "what's my collection worth?" is a top acquisition hook. Show *current* value to everyone. |
| Total collection value on dashboard | High | High | Low | High | Low | 🟢 **Free** — the at-a-glance number that hooks users. |
| **Price history charts** (over time) | Low | Med | **High** | **Low** | Med | 🔵 **Pro** — pure power-user analytics, no network effect, real storage cost. Ideal gate. |
| **Portfolio analytics / ROI report** | Low | Med | **High** | **Low** | Low | 🔵 **Pro** — the flagship paid feature. Serious collectors treating cards as investment will pay. |
| **Market refresh frequency** | Low | Med | Med | Low | **High** | 🟡 **Freemium** — free auto-updates once daily via scheduled batch; the **manual on-demand refresh is Pro**. Cost-aligned + spike-protected *(see §7b)*. |
| Price alerts | Med | **High** | Med | **High** | Low | 🟢 **Free** *(decided)* — alerts drive return visits *and* purchases (GMV). Keep it feeding the flywheel. **Instant priority push is a Pro perk** *(see §7f)*; free stays timely. |

### 3c. Marketplace & trading (the liquidity engine — keep open)

| Feature | Acq | Ret | WTP | Gating cost | Serve | Recommendation |
|---|---|---|---|---|---|---|
| Marketplace browse | **High** | High | Low | **High** | Low | 🟢 **Free** — crawlable, the demand side of the network. |
| Create listings (sell/trade) | High | High | Med | **High** | Low | 🟡 **Freemium — 100 active free → unlimited Pro** *(decided)*. Cap raised from 10 so it only bites power-sellers. Pro also adds a **"Pro Seller" status badge** on listings/storefront (trust → GMV; see §7c). |
| Offer system (cash/trade/counter) | High | High | Med | **High** | Low | 🟢 **Free** — this *is* the transaction engine that earns the fee. |
| Transaction history | Low | Med | Low | Med | Low | 🟢 **Free** — record of completed deals; trust feature. |
| Trade matching | Med | **High** | Med | **High** | Low | 🟢 **Free** — surfaces deals → more GMV. |
| Storefronts (per-user) | **High** | Med | Med | **High** | Low | 🟢 **Free** — SEO landing pages + seller credibility. |
| Watchlist | Low | High | Low | Med | Low | 🟢 **Free** — retention loop into the marketplace. |
| Listing pause / "Vacation Mode" | Low | Med | Med | Med | Low | 🟡 **Basic pause free; scheduled vacation mode Pro** *(see §7h)* — gating the baseline hygiene fix would harm buyers. |

### 3d. Social & community (acquisition + virality — keep open)

| Feature | Acq | Ret | WTP | Gating cost | Serve | Recommendation |
|---|---|---|---|---|---|---|
| Public profiles | **High** | Med | Low | **High** | Low | 🟢 **Free** — primary SEO/share surface. |
| Follows & feeds | Med | **High** | Low | **High** | Low | 🟢 **Free** — social graph = retention + network density. |
| Community hub (leaderboard, snapshot) | **High** | Med | Low | **High** | Low | 🟢 **Free** — discovery + crawlable market data. |
| In-app messaging | Med | High | Low | **High** | Med | 🟢 **Free** — deals are negotiated here; gating throttles GMV. |
| Achievement badges (50) | Med | **High** | Low | Med | Low | 🟢 **Free** — engagement/gamification; works only at scale. |
| Reviews (platform reviews) | **High** | Low | Low | **High** | Low | 🟢 **Free** — social proof / SEO. |
| Collections (set/rarity tracking) | Med | High | Low | Med | Low | 🟢 **Free** — core hobby loop; keep the *basic* tracking free. |
| **Collection showcase (advanced styling)** | Med | Med | Med | **Low** | Low | 🔵 **Pro (advanced only)** — basic public showcase free; advanced customization is a fair cosmetic upsell, e.g. **foil/holographic card borders** *(see §7g)* — vanity that doubles as social/SEO advertising. |
| Pack reveals (log + publish) | **High** (UGC) | High | Med | **High** | Low | 🟢 **Free** *(decided)* — shareable pull content is community fuel and acquisition; publishing stays free. |
| Wishlist | Med | High | Low | **High** | Low | 🟢 **Free** — powers trade matching + price alerts (both GMV drivers). |

### 3e. Account & platform

| Feature | Recommendation |
|---|---|
| Auth (email + Google/Discord OAuth) | 🟢 **Free** — table stakes. |
| Notifications | 🟢 **Free** — retention infrastructure. |
| Profile customization (color, bio, specialty) | 🟢 **Free** (basic). A premium avatar frame / Pro flair could be a cosmetic Pro perk later. |
| Supporter badge | 🟢 **Free** (donation-driven, already shipped). |
| Pro badge / title | 🔵 Subscriber-only by definition (already shipped). |

---

## 4. Recommended tiers (decided 2026-06-13)

### 🟢 Always free — the growth & liquidity core
**Unlimited inventory storage + current market value on every card** · inventory CRUD + TCG search · total collection value · sealed product tracking · **bulk import** · bulk edit · duplicate detection · full marketplace (browse, offer, counter, complete) · transaction history · trade matching · storefronts · watchlist · public profiles · follows/feeds · community hub · messaging · badges · reviews · basic collections · **pack reveals (log + publish)** · wishlist · **price alerts** · auth · notifications · basic profile customization.

### 🟡 Freemium limits — generous free tier, Pro removes the ceiling
- **Active marketplace listings:** **100 active** free → unlimited Pro
- **Market price refresh:** free tier auto-updates **once daily via scheduled batch**; the **manual on-demand refresh is Pro** *(see §7b)*

### 🔵 Pro-gated — high-WTP personal utility, zero network cost
- **Price history charts** (portfolio value over time)
- **Portfolio analytics / ROI report**
- **Collection showcase — advanced customization** (basic showcase stays free), incl. **foil/holographic card borders** *(see §7g)*
- **Bulk export (CSV)** — the paid counterpart to free import, incl. **Tax/Insurance export presets** *(see §7e)*
- **Manual live-price refresh** button *(see §7b)*
- **Instant priority price alerts** (real-time push; free stays timely) *(see §7f)*
- **Scheduled "Vacation Mode"** for listings (basic pause stays free) *(see §7h)*
- **"Pro Seller" status badge** on listings + storefront *(trust signal; see §7c)*

### 🟣 One-time purchase (optional, opportunistic)
- A one-time **bulk-export unlock** for non-subscribers who need a single export without subscribing — **priced fairly** (≈ one month of Pro), *not* as a punitive escape tax *(see §7d)*.

---

## 5. Resolved decisions (2026-06-13)

The five flags below previously conflicted with the marketed plan (pricing page / TODO). All are now decided:

1. **✅ Listing cap raised 10 → 100.** Capping listings suppresses marketplace *supply* (and the transaction-fee revenue that is the bigger engine). At 100 active, only true power-sellers feel it; new sellers never do. **Freemium: 100 free → unlimited Pro.**

2. **✅ Price alerts are free.** Resolves the prior free-vs-Pro contradiction in favor of free — alerts pull users back (retention) and convert into purchases (GMV); their network value exceeds their subscription value.

3. **✅ Pack reveals are fully free (log + publish).** Shared pulls are user-generated, shareable acquisition content; publishing is not gated. Any future Pro angle would be a cosmetic enhancement only, never publishing itself.

4. **✅ Inventory — no storage cap; gate the insight, not the storage** *(updated — supersedes the earlier 2,500-card cap)*. Storage is *participation*, so capping it violated the core thesis. Free users now get **unlimited inventory and current value on every card**; the Pro lever is the historical/ROI **analytics** (already gated). Storage and current-value compute are cheap (global card prices, no per-card API), so there's no cost reason to cap. *(See §7a for the reasoning that replaced the hard cap. Prior decision was 2,500, up from a user-proposed 1,000.)*

5. **✅ Import free, export paid.** Import is the spreadsheet-migration/activation moment and stays free. **Bulk CSV export** becomes the paid counterpart (🔵 Pro), with an optional one-time export unlock for non-subscribers — gating data-*out* costs no acquisition while carrying real power-user/dealer WTP.

---

## 6. Grandfathering & rollout notes

- **Grandfather existing users** on any feature they already use when enforcement ships (per the Phase 4 note) — pulling away a working feature generates churn and ill will far exceeding the conversions it forces.
- **Gate with upsell, not walls.** Each gated surface should show *what* the feature does + a contextual "Upgrade to Pro" nudge, never a blank/erroring page. The gate is a marketing surface.
- **Enforcement has two mechanisms** (different effort):
  - **Boolean gates** (price history, ROI, advanced showcase, bulk export, manual refresh button, "Pro Seller" listing badge) — simple `isPro()` checks + hide/teaser entry points.
  - **Quota gate** (listing cap of 100) — requires a count query + limit constant + "you've hit your cap" upsell. *(Inventory is no longer capped; market refresh is now a boolean gate on the manual button, not a quota — see §7a–b.)*
- Use `lib/isPro.ts` for true entitlement checks (it already enforces expiry at read time). Subscriber-only *signification* uses `lib/proStatus.ts` `isProSubscriber()`.

---

## 7. External review revisions (2026-06-13)

An external strategic review (conducted **without codebase access**) proposed four refinements. Three are adopted and folded into the tables above; one is rejected. Recorded here with rationale and provenance.

### 7a. Inventory: unlimited storage, gate the insight *(adopted — principle only)*
The review correctly flagged that our hard 2,500-card cap gated **storage**, which is *participation* — the exact thing the thesis says never to charge for. **Adopted:** storage is unlimited and free, with current value shown on every card; the Pro lever is the historical/ROI analytics we already gate. **Not adopted:** the proposed "blind portfolio" (compute free metrics only on the top 2,500 cards *by value* and blur the rest). It's fiddly to build (continuous value-ranking + subset totals across every valuation query), the hidden cards are low-value so the upgrade nudge is weak, and showing users a deliberately incomplete view of their own data risks feeling manipulative. **Keep the principle, drop the theater.**

### 7b. Market refresh: free daily batch, gate the manual button *(adopted)*
Sharpens the vague "1×/day vs multiple/day" into a concrete mechanism: free users get the scheduled off-peak daily price sync; the **manual on-demand refresh button** (`RefreshMarketButton`) is the Pro lever. Cost-aligned to the TCGPlayer API and protects against concurrent-refresh spikes during peak hobby hours. Clean boolean gate; the pieces already exist.

### 7c. "Pro Seller" badge on listings *(adopted — renamed)*
A Pro status badge on a seller's listings/storefront is a trust signal that lifts buyer conversion → more GMV → more transaction-fee revenue. **Adopted**, extending the existing `ProBadge`/`ProTitle` (already live on profiles, storefronts, community, dashboard) down to individual marketplace listings. **Renamed** from the proposed *"Verified Dealer"*: we perform no identity/business verification, and a "Verified" label not backed by KYC is misleading and a liability if a badged seller scams a buyer. It signals **subscription status, not verification.**

### 7d. Rejected: floor-pricing the export to trap cancellers
The review proposed pricing the one-time export at ~3× monthly ($14.99) so price-sensitive users would instead subscribe, export, and cancel — explicitly banking on users who *"forget to cancel"* or hit *"friction while canceling."* **Rejected.** It's a dark pattern that (1) contradicts the trust-first thesis the whole marketplace depends on — manufacturing chargebacks and "Vaultset won't let you leave" reviews; (2) runs into FTC click-to-cancel / EU consumer rules / card-network cancellation requirements; and (3) treats a user's own data as a hostage, when GDPR/CCPA grant a data-portability right regardless. Export stays a clean Pro convenience; any one-time unlock is priced fairly, and a basic compliance data-export is always available, separate from the bulk-CSV feature.

---

### Round 2 — low-engineering upsell additions (2026-06-13)

A second external pass proposed four "low-hanging fruit" upsells. Dispositions:

**7e. Export presets — Tax / Insurance *(adopted; CSV-first)*.** Reframes the already-Pro bulk export into pre-formatted **cost-basis/tax** and **insurance-inventory** templates — a solve-a-real-problem utility for high-value collectors, and the *legitimate* rationale for export-as-Pro (replacing the rejected 2d trap logic). Ship **CSV presets first**; a formatted PDF is a real pipeline, not "zero engineering," so defer it. Label as a data export carrying a **"not tax/insurance advice"** disclaimer — don't imply fitness for filing.

**7f. Priority alert delivery — instant push = Pro *(adopted; modified)*.** Keeps the "charge for **speed**, not access" framing: price alerts stay free, but **instant real-time push** is a Pro perk. **Modified:** free users stay *timely* (standard push / hourly digest), **not** a punitive multi-hour delay — alerts exist to drive GMV, and crippling free latency strangles that flywheel. **SMS dropped from the base perk** — real per-message cost (breaks the ~$0 constraint) and no push/SMS infra exists today; treat SMS as a separate, capped, costed add-on if ever.

**7g. Foil / holographic showcase borders *(adopted)*.** A concrete instance of the advanced-showcase Pro item: CSS-driven foil/holo borders on a user's rarest cards in public views. Zero network cost, pure vanity, and — since public profiles are the SEO/acquisition engine — every shared foil-rimmed card is a native Pro ad. Keep it tasteful/performant on mobile.

**7h. Marketplace "Vacation Mode" *(partially adopted)*.** A bulk listing-pause is a fair convenience, but gating the *baseline* is a hygiene risk: a free seller who can't pause leaves stale listings that hurt buyers and trust. **Adopted split:** **basic pause is free** (platform health); the **scheduled / auto-reply "Vacation Mode"** is the Pro layer.

**Reaffirmed rejections.** The **blind-portfolio** valuation cap (2a-full) and the **$14.99 export trap** (2d) were re-proposed without new arguments; the positions in §7a / §7d stand. Their implementation notes are therefore moot — there is no row-2,500 valuation gate or "card 2,501" banner, and no new `pro_status_badge` SVG column is needed (the `ProBadge` component + `is_pro`/`pro_plan` already handle badging).

---

## 8. One-line thesis

**Charge for insight and convenience; never charge for participation.** The collection tracker and the marketplace are the growth and revenue flywheels — keep them free and frictionless. Sell the analytics, history, and polish that serious collectors want but that no one else needs.
