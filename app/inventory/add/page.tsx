"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { PokemonCardSearch } from "@/components/PokemonCardSearch";
import { CardScanner } from "@/components/CardScanner";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";
import { RaritySelect } from "@/components/RaritySelect";
import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";
import { deriveIsEx, isPromoCard } from "@/lib/cards/cardTraits";
import { deriveFinishes, sortFinishes, FINISH_LABELS } from "@/lib/sets/setCardFinishes";
import { DuplicateCardModal } from "@/components/DuplicateCardModal";
import { EditCardForm } from "@/components/EditCardForm";

// Instantiated once at module level — demonstrates encapsulation:
// all game-specific rarity and search logic lives inside these classes.
const raritySystem = new PokemonRaritySystem();
const searchProvider = new PokemonTCGProvider();

const CONDITIONS = [
  { value: "mint",              label: "Mint" },
  { value: "near_mint",         label: "Near Mint" },
  { value: "lightly_played",    label: "Lightly Played" },
  { value: "moderately_played", label: "Moderately Played" },
  { value: "heavily_played",    label: "Heavily Played" },
  { value: "damaged",           label: "Damaged" },
];

const GRADERS = ["PSA", "BGS", "CGC", "SGC"];


// Finish options shown only for Common / Uncommon / Rare (booster context)
const SELECTABLE_FINISHES = [
  { value: "non_holo",         label: "Non-Holo" },
  { value: "holofoil",         label: "Holofoil" },
  { value: "reverse_holofoil", label: "Reverse Holofoil" },
];

// Full finish list — used when promo override is active
const ALL_FINISHES = [
  { value: "non_holo",          label: "Non-Holo" },
  { value: "holofoil",          label: "Holofoil" },
  { value: "reverse_holofoil",  label: "Reverse Holofoil" },
  { value: "textured_holofoil", label: "Textured Holofoil" },
  { value: "gold_etched",       label: "Gold Etched" },
];

// Maps a TCGplayer price-point key → our finish value. Used to preselect a
// promo's finish from its actual printing data (a promo's finish can't be
// derived from a rarity symbol, but the price data tells us which printings
// exist).
const TCG_PRICE_KEY_TO_FINISH: Record<string, string> = {
  normal:             "non_holo",
  holofoil:           "holofoil",
  reverseHolofoil:    "reverse_holofoil",
  "1stEditionNormal": "non_holo",
  "1stEditionHolofoil": "holofoil",
};

// Returns the single finish a promo's pricing data implies, or "" when there
// are zero or multiple distinct printings (ambiguous → let the user choose).
function promoFinishFromPrices(prices?: Record<string, unknown> | null): string {
  const finishes = [
    ...new Set(
      Object.keys(prices ?? {})
        .map((k) => TCG_PRICE_KEY_TO_FINISH[k])
        .filter(Boolean),
    ),
  ];
  return finishes.length === 1 ? finishes[0] : "";
}

// True when a search payload already carries a usable market price. When it
// doesn't (e.g. a brand-new set pokemontcg.io hasn't priced yet), the add form
// resolves the authoritative value through the pricing engine instead.
function hasUsableMarket(t?: TcgPlayerData | null): boolean {
  return !!t?.prices && Object.values(t.prices).some((p) => p?.market != null);
}

// Variant options available when promo override is active.
// Promo cards can have any visual design regardless of rarity symbol.
const PROMO_VARIANTS = [
  { value: "standard",                  label: "Standard" },
  { value: "standard_holo",             label: "Standard Holo" },
  { value: "cosmos_holo",               label: "Cosmos Holo" },
  { value: "standard_ex",               label: "Standard ex" },
  { value: "full_art",                  label: "Full Art" },
  { value: "illustration_rare",         label: "Illustration Rare (Alt Art)" },
  { value: "special_illustration_rare", label: "Special Illustration Rare (Alt Art ex)" },
  { value: "gold_card",                 label: "Gold Card" },
  { value: "standard_v",                label: "Standard V" },
  { value: "vmax",                      label: "VMAX" },
  { value: "vstar",                     label: "VSTAR" },
];


// A copy of this card the collector already owns. Carries every field the edit form
// needs, so tapping one in the duplicate modal opens it without a second round-trip.
type VaultCopy = {
  id: string;
  condition: string | null;
  finish: string | null;
  quantity: number;
  paid_price: number | null;
  list_price: number | null;
  market_price: number | null;
  for_sale: boolean;
  for_trade: boolean;
  grader: string | null;
  grade: number | null;
  cert_number: string | null;
  notes: string | null;
  product_purchase_id: string | null;
  cards: {
    name: string;
    set_name: string;
    card_number: string | null;
    game: string;
    image_url: string | null;
  } | null;
};

function inputClass() {
  return "w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors";
}
function labelClass() {
  return "mb-1.5 block text-sm font-medium text-foreground-muted";
}
function selectClass() {
  return "w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors";
}
function lockedFieldClass() {
  return "flex items-center justify-between rounded-xl border border-border bg-surface-raised px-4 py-3";
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="flex items-center gap-3">
      <span className={`relative flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors ${on ? "border-gold bg-gold" : "border-border bg-surface-raised"}`}>
        <span className={`h-4 w-4 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
      <span className="text-sm text-foreground-muted">{label}</span>
    </button>
  );
}

export default function AddCardPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [name, setName]             = useState("");
  const [cardSet, setCardSet]       = useState("");
  const [setCode, setSetCode]       = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [imageUrl, setImageUrl]     = useState("");

  const [pokemonApiId, setPokemonApiId] = useState("");
  const [tcgplayerId, setTcgplayerId]   = useState("");
  const [rarity, setRarity]   = useState("");
  const [variant, setVariant] = useState("");
  const [finish, setFinish]   = useState("");
  const [edition, setEdition] = useState("");
  const [isEx, setIsEx]       = useState(false);

  const [condition, setCondition]   = useState("");
  const [quantity, setQuantity]     = useState("1");
  const [paidPrice, setPaidPrice]   = useState("");
  const [listPrice, setListPrice]   = useState("");
  const [forSale, setForSale]       = useState(false);
  const [forTrade, setForTrade]     = useState(false);
  const [graded, setGraded]         = useState(false);
  const [grader, setGrader]         = useState("");
  const [grade, setGrade]           = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [notes, setNotes]           = useState("");

  const [tcgplayerData, setTcgplayerData] = useState<TcgPlayerData | null>(null);
  // Real per-condition prices (JustTCG), when the engine resolves them — lets the
  // estimate match the value the engine actually stores. Null → NM×multiplier.
  const [conditionPrices, setConditionPrices] = useState<Record<string, Record<string, number>> | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const priceReqRef = useRef(0); // guards against out-of-order price resolutions

  const [sets, setSets]             = useState<{ id: string; name: string; series: string }[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [products, setProducts]           = useState<{ id: string; name: string; product_type: string }[]>([]);
  const [linkedProduct, setLinkedProduct] = useState(searchParams.get("product") ?? "");

  useEffect(() => {
    fetch("/api/pokemon-sets")
      .then((r) => r.json())
      .then((json) => { setSets(json.data ?? []); setSetsLoading(false); })
      .catch(() => setSetsLoading(false));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("product_purchases").select("id, name, product_type")
        .eq("user_id", user.id).order("purchased_at", { ascending: false })
        .then(({ data }) => setProducts(data ?? []));
    });
  }, []);

  const setsBySeries = sets.reduce<Record<string, { id: string; name: string }[]>>((acc, s) => {
    if (!acc[s.series]) acc[s.series] = [];
    acc[s.series].push({ id: s.id, name: s.name });
    return acc;
  }, {});

  function handleSetSelect(setId: string) {
    const s = sets.find((x) => x.id === setId);
    if (s) { setCardSet(s.name); setSetCode(s.id); }
  }

  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState("");
  // Ownership overlap with what's already in the vault. `dupMode` is "select" when the
  // check ran the moment a card was picked (informational) and "submit" when the entry
  // about to be created is identical to an existing one (confirm before saving).
  const [dupMode, setDupMode]         = useState<"select" | "submit" | null>(null);
  const [dupCopies, setDupCopies]     = useState<VaultCopy[]>([]);
  const [editingCopy, setEditingCopy] = useState<VaultCopy | null>(null);
  const dupReqRef = useRef(0); // guards against a slow lookup landing after a newer pick

  // Scanner telemetry: how the card was selected (scan/search/manual), which scan
  // result rank, and an identity snapshot to diff against the final saved values.
  const pendingSourceRef = useRef<{ source: "scan" | "search"; index: number | null } | null>(null);
  const selectionRef = useRef<{ source: "scan" | "search"; index: number | null; snapshot: Record<string, string> } | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const pendingEventRef = useRef<{ source: string; index: number | null; acceptedFirst: boolean | null; modifiedFields: string[] } | null>(null);

  function logScanEvent(extra?: { feedback?: string }) {
    const ev = pendingEventRef.current;
    if (!ev) return;
    fetch("/api/scan-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ev, ...extra }),
    }).catch(() => { /* telemetry best-effort */ });
  }

  function handleScanSelect(card: Parameters<typeof handlePokemonSelect>[0], index: number) {
    pendingSourceRef.current = { source: "scan", index };
    handlePokemonSelect(card);
  }
  function handleSearchSelect(card: Parameters<typeof handlePokemonSelect>[0]) {
    pendingSourceRef.current = { source: "search", index: null };
    handlePokemonSelect(card);
  }

  const computedMarketHint = tcgplayerData
    ? searchProvider.getMarketPrice(
        tcgplayerData, finish || null, edition || null,
        graded ? null        : condition || null,
        graded ? grader || null : null,
        graded && grade ? Number(grade) : null,
        conditionPrices,
      )
    : null;

  // Derived from rarity via the rarity system — demonstrates polymorphism:
  // swapping raritySystem for a different game's implementation changes
  // all variant/finish behaviour without touching this component.
  // Promo is a rarity now, not a separate flag. A promo card has no rarity-locked
  // variant/finish, so those become manual selectors (variantInfo === null).
  const isPromo = rarity === "promo";
  const variantInfo = isPromo ? null : raritySystem.getVariantInfo(rarity);

  // The finishes THIS card was actually printed in, from its TCGplayer price keys
  // — the same derivation master-set completion uses for its denominator
  // (lib/sets/setCardFinishes). A rarity's locked finish says which printing the
  // rarity SYMBOL implies, not that it's the card's only printing: 1,185 of our
  // 1,502 rare_holo cards also exist as a reverse holo. Hard-locking the field hid
  // those copies entirely — they couldn't be recorded, and their master-set slots
  // could never be filled. So lock only when the card genuinely has one printing;
  // otherwise let the collector say which one is in their hand. Purely additive:
  // the rarity's finish (or the booster-context trio) is always still offered.
  const printedFinishes = (() => {
    const priceKeys = Object.keys(tcgplayerData?.prices ?? {});
    const derived = priceKeys.length
      ? deriveFinishes({ priceKeys, rarityKey: rarity || null }).finishes
      : [];
    const base = variantInfo ? [variantInfo.finishKey] : SELECTABLE_FINISHES.map((f) => f.value);
    return sortFinishes([...new Set([...base, ...derived])]);
  })();

  function applyRarity(mappedRarity: string) {
    setRarity(mappedRarity);
    if (mappedRarity === "promo") { setVariant(""); setFinish(""); return; }
    const info = raritySystem.getVariantInfo(mappedRarity);
    if (info) {
      setVariant(info.variantKey);
      setFinish(info.finishKey);
    } else {
      setVariant("");
      setFinish("");
    }
  }

  function handlePokemonSelect(card: {
    id: string; name: string; number: string; rarity?: string; rarityKey?: string;
    subtypes?: string[];
    set: { id: string; name: string };
    images: { small: string; large: string };
    tcgplayer?: TcgPlayerData | null;
  }) {
    setDupMode(null);
    setDupCopies([]);

    // Tell the collector they already own this card the moment it's identified —
    // waiting until save meant filling out the whole form first. Non-blocking: owning
    // a second copy in another condition/grade/finish is normal, so the modal informs
    // rather than stops. reqId guards a slow lookup landing after a newer selection.
    const dupReq = ++dupReqRef.current;
    findExistingCopies({
      pokemonApiId: card.id.startsWith("tcg:") ? "" : card.id,
      name: card.name,
      cardSet: card.set.name,
      cardNumber: card.number,
    })
      .then((copies) => {
        if (dupReq !== dupReqRef.current) return; // superseded by a newer pick
        setDupCopies(copies);
        if (copies.length > 0) setDupMode("select");
      })
      .catch(() => { /* best-effort — a failed lookup must not block adding a card */ });

    // JustTCG-sourced results carry a "tcg:<productId>" id (no pokemon_api_id).
    if (card.id.startsWith("tcg:")) {
      setPokemonApiId("");
      setTcgplayerId(card.id.slice(4));
    } else {
      setPokemonApiId(card.id);
      setTcgplayerId("");
    }
    setTcgplayerData(card.tcgplayer ?? null);
    setConditionPrices(null);

    // Rarity: prefer an already-mapped key (scan enrichment from our own catalog),
    // else map the raw pokemontcg.io rarity. Promo is a rarity, detected from the
    // matched card's set name (or an enriched promo key). Computed up front so the
    // async price resolution below can fill the promo finish once it lands.
    const mappedRarity =
      card.rarityKey ??
      (card.rarity ? searchProvider.mapRarity(card.rarity.toLowerCase()) : "");
    const finalRarity = isPromoCard(card.set.name, mappedRarity) ? "promo" : mappedRarity;

    // When the search payload has no usable price (e.g. a brand-new set that
    // pokemontcg.io hasn't priced yet, or a tcg:-sourced promo), resolve the real
    // value through the pricing engine so the live estimate isn't blank. Cache-first
    // (6h) → cheap, and it warms the shared cache for everyone. Established cards
    // already have a price in the payload, so no extra request is spent. reqId
    // guards against a slow response landing after the user picks a different card.
    if (!hasUsableMarket(card.tcgplayer)) {
      const reqId = ++priceReqRef.current;
      setPriceLoading(true);
      fetch("/api/card-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId: card.id, name: card.name, setName: card.set.name, setCode: card.set.id, number: card.number }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (reqId !== priceReqRef.current) return; // superseded by a newer selection
          if (j?.prices) {
            setTcgplayerData({ url: j.tcgplayerUrl ?? "", updatedAt: j.updatedAt ?? "", prices: j.prices });
            setConditionPrices(j.conditionPrices ?? null);
            // Promo finish is only inferable once real prices resolve (tcg: promos
            // arrive priceless). Fill it if the user hasn't already picked one.
            if (finalRarity === "promo") setFinish((prev) => prev || promoFinishFromPrices(j.prices));
          }
        })
        .catch(() => { /* leave estimate blank — the card still saves and fills later */ })
        .finally(() => { if (reqId === priceReqRef.current) setPriceLoading(false); });
    } else {
      priceReqRef.current++;   // invalidate any in-flight resolution from a prior pick
      setPriceLoading(false);
    }
    setName(card.name);
    setCardSet(card.set.name);
    setSetCode(card.set.id);
    setCardNumber(card.number);
    setImageUrl(card.images.large);

    setRarity(finalRarity);

    if (finalRarity === "promo") {
      setVariant("");
      // Preselect the finish when the card's pricing data implies a single
      // printing; leave blank (user picks) when it's ambiguous.
      setFinish(promoFinishFromPrices(card.tcgplayer?.prices));
    } else {
      const info = raritySystem.getVariantInfo(finalRarity);
      if (info) { setVariant(info.variantKey); setFinish(info.finishKey); }
      else       { setVariant(""); setFinish(""); }
    }

    setIsEx(deriveIsEx(card.name, card.subtypes));

    // Snapshot the auto-filled identity so we can tell at save time whether the
    // user had to correct the scanned/searched card's data.
    const src = pendingSourceRef.current ?? { source: "search" as const, index: null };
    pendingSourceRef.current = null;
    selectionRef.current = {
      source: src.source,
      index: src.index,
      snapshot: {
        name: card.name,
        setCode: card.set.id,
        cardNumber: card.number,
        rarity: finalRarity,
      },
    };
  }

  /**
   * Every copy of this card already in the collector's vault, regardless of finish,
   * condition or grade — those are shown so the collector can judge for themselves
   * whether the card in their hand is really the same one. Identity is taken as a
   * parameter rather than read from state because the on-select check runs in the
   * same tick the state is being set.
   */
  async function findExistingCopies(identity: {
    pokemonApiId: string; name: string; cardSet: string; cardNumber: string;
  }): Promise<VaultCopy[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let matchingCardIds: string[] = [];

    if (identity.pokemonApiId) {
      const { data } = await supabase
        .from("cards")
        .select("id")
        .contains("game_data", { pokemon_api_id: identity.pokemonApiId });
      matchingCardIds = data?.map((c) => c.id) ?? [];
    } else if (identity.name && identity.cardSet) {
      let q = supabase.from("cards").select("id").eq("name", identity.name).eq("set_name", identity.cardSet);
      if (identity.cardNumber) q = q.eq("card_number", identity.cardNumber);
      const { data } = await q;
      matchingCardIds = data?.map((c) => c.id) ?? [];
    }

    if (matchingCardIds.length === 0) return [];

    const { data: existing } = await supabase
      .from("collection_items")
      .select(`
        id, condition, finish, quantity, paid_price, list_price, market_price,
        for_sale, for_trade, grader, grade, cert_number, notes, product_purchase_id,
        cards ( name, set_name, card_number, game, image_url )
      `)
      .eq("user_id", user.id)
      .in("card_id", matchingCardIds)
      .is("transfer_status", null)
      .limit(10);

    return (existing ?? []).map((row) => ({
      ...row,
      cards: Array.isArray(row.cards) ? row.cards[0] ?? null : row.cards ?? null,
    })) as unknown as VaultCopy[];
  }

  /**
   * True when an existing copy is the *same entry* as the one being added — same
   * finish, and same condition or same grade. Finish is part of a copy's identity,
   * not a detail of it: a holo and a reverse holo of the same card are different
   * collectibles occupying different master-set slots. Condition and grade likewise
   * separate two legitimate rows, which is why the save-time confirmation only fires
   * on a true match — the broader "you own this card" heads-up already fired on select.
   */
  function isSameEntry(copy: VaultCopy): boolean {
    if ((copy.finish ?? "") !== finish) return false;
    if (graded) {
      return (copy.grader ?? "") === grader && (copy.grade ?? null) === (grade ? Number(grade) : null);
    }
    return !copy.grader && copy.grade == null && (copy.condition ?? "") === condition;
  }

  async function performSave() {
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const game_data: Record<string, unknown> = {};
    if (pokemonApiId) game_data.pokemon_api_id = pokemonApiId;
    if (tcgplayerId)  game_data.tcgplayer_id   = tcgplayerId;
    if (variant)      game_data.variant        = variant;
    if (edition)      game_data.edition        = edition;
    if (rarity)       game_data.rarity         = rarity;
    game_data.is_ex    = isEx;

    const { data: card, error: cardError } = await supabase
      .from("cards")
      .insert({
        game: "pokemon",
        name,
        set_name: cardSet,
        set_code: setCode || null,
        card_number: cardNumber || null,
        year: null,
        image_url: imageUrl || null,
        game_data,
      })
      .select()
      .single();

    if (cardError) {
      setError(cardError.message);
      setLoading(false);
      return;
    }

    const marketPrice = searchProvider.getMarketPrice(
      tcgplayerData, finish || null, edition || null,
      graded ? null        : condition || null,
      graded ? grader || null : null,
      graded && grade ? Number(grade) : null,
      conditionPrices,
    );

    const { error: itemError } = await supabase.from("collection_items").insert({
      user_id:      user!.id,
      card_id:      card.id,
      condition:    graded ? null : condition || null,
      finish:       finish || null,
      quantity:     Number(quantity),
      paid_price:   paidPrice ? Number(paidPrice) : null,
      list_price:   listPrice ? Number(listPrice) : null,
      market_price: marketPrice,
      for_sale:     forSale,
      for_trade:    forTrade,
      grader:       graded ? grader || null : null,
      grade:        graded && grade ? Number(grade) : null,
      cert_number:         graded ? certNumber || null : null,
      product_purchase_id: linkedProduct || null,
      notes:        notes || null,
    });

    if (itemError) {
      setError(itemError.message);
      setLoading(false);
      return;
    }

    // Populate the tracked market value through the cache-first, gap-aware engine
    // (bedrock for what it can, JustTCG for the gaps) so the card doesn't land with
    // a null market_price when the search payload carried no usable price. Usually
    // a cache hit here — the on-select estimate already warmed it. Best-effort: the
    // card is already saved, so a failure here must not block the add.
    try {
      const apiId = pokemonApiId
        ? pokemonApiId
        : tcgplayerId ? `tcg:${tcgplayerId}` : `manual:${card.id}`;
      await fetch("/api/populate-card-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, name, setName: cardSet, setCode, number: cardNumber }),
      });
    } catch {
      /* non-fatal — market value can be filled later via "Fill missing prices" */
    }

    // Build the add-telemetry event: source, whether the top scan result was
    // accepted, and which identity fields were corrected vs the selection snapshot.
    const sel = selectionRef.current;
    const source = sel?.source ?? "manual";
    let modifiedFields: string[] = [];
    if (sel) {
      const cur: Record<string, string> = { name, setCode, cardNumber, rarity };
      modifiedFields = Object.keys(sel.snapshot).filter((k) => sel.snapshot[k] !== cur[k]);
    }
    pendingEventRef.current = {
      source,
      index: sel?.index ?? null,
      acceptedFirst: source === "scan" ? sel?.index === 0 : null,
      modifiedFields,
    };

    // Scan-sourced adds: log and go. Non-scan adds (never scanned, or scanned and
    // fell back to manual/search): prompt for feedback first, then log + go.
    if (source === "scan") {
      logScanEvent();
      router.push("/inventory");
      router.refresh();
    } else {
      setLoading(false);
      setFeedbackOpen(true);
    }
  }

  function finishFeedback(send: boolean) {
    logScanEvent(send && feedbackText.trim() ? { feedback: feedbackText.trim() } : undefined);
    setFeedbackOpen(false);
    router.push("/inventory");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const copies = await findExistingCopies({ pokemonApiId, name, cardSet, cardNumber });
    const identical = copies.filter(isSameEntry);
    if (identical.length > 0) {
      setDupCopies(identical);
      setDupMode("submit");
      return;
    }

    await performSave();
  }

  async function handleAddAnyway() {
    setDupMode(null);
    await performSave();
  }

  /** Clears the identified card so the collector can scan or search for another. */
  function clearSelection() {
    dupReqRef.current++;
    priceReqRef.current++;
    setDupMode(null);
    setDupCopies([]);
    setPokemonApiId(""); setTcgplayerId("");
    setName(""); setCardSet(""); setSetCode(""); setCardNumber(""); setImageUrl("");
    setRarity(""); setVariant(""); setFinish(""); setIsEx(false);
    setTcgplayerData(null); setConditionPrices(null); setPriceLoading(false);
    selectionRef.current = null;
  }

  return (
    <div className="space-y-8">
      {feedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">Card added — quick feedback?</h3>
              <p className="mt-1 text-sm text-foreground-muted">
                You added this one without the scanner. Mind saying why — didn&apos;t try it, or did it
                miss your card? Helps us make scanning better. (optional)
              </p>
            </div>
            <textarea
              rows={3}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g. scan couldn't read the number · didn't find my card · just faster to type"
              className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold resize-none"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => finishFeedback(false)}
                className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => finishFeedback(true)}
                className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-background hover:bg-gold-light transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
      {dupMode && dupCopies.length > 0 && !editingCopy && (
        <DuplicateCardModal
          mode={dupMode}
          copies={dupCopies}
          cardName={name}
          setName={cardSet}
          cardNumber={cardNumber}
          imageUrl={imageUrl}
          saving={loading}
          onEdit={(id) => {
            const copy = dupCopies.find((c) => c.id === id);
            if (copy) { setDupMode(null); setEditingCopy(copy); }
          }}
          onContinue={() => (dupMode === "submit" ? handleAddAnyway() : setDupMode(null))}
          onDismiss={() => (dupMode === "submit" ? setDupMode(null) : clearSelection())}
        />
      )}

      {editingCopy && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto my-8 w-full max-w-2xl rounded-2xl border border-border bg-surface p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-foreground">Edit Card</h3>
                <p className="mt-0.5 text-sm text-foreground-muted">
                  Update the copy you already own — saving takes you to your inventory.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setEditingCopy(null)}
                className="rounded-full border border-border p-1.5 text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <EditCardForm
              mode="modal"
              onCancel={() => setEditingCopy(null)}
              item={{
                id:           editingCopy.id,
                condition:    editingCopy.condition ?? "",
                finish:       editingCopy.finish ?? "",
                quantity:     editingCopy.quantity,
                paid_price:   editingCopy.paid_price,
                list_price:   editingCopy.list_price,
                market_price: editingCopy.market_price,
                for_sale:     editingCopy.for_sale,
                for_trade:    editingCopy.for_trade,
                grader:       editingCopy.grader ?? "",
                grade:        editingCopy.grade,
                cert_number:  editingCopy.cert_number ?? "",
                notes:        editingCopy.notes ?? "",
                product_purchase_id: editingCopy.product_purchase_id,
              }}
              card={{
                name:        editingCopy.cards?.name ?? name,
                set_name:    editingCopy.cards?.set_name ?? cardSet,
                card_number: editingCopy.cards?.card_number ?? cardNumber,
                game:        editingCopy.cards?.game ?? "pokemon",
                image_url:   editingCopy.cards?.image_url ?? imageUrl,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link href="/inventory" className="text-foreground-muted hover:text-foreground transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Add Card</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">Manually add a Pokémon card to your vault</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

        {/* Card details */}
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Card Details</h2>

          <div>
            <label className={labelClass()}>Search Card</label>
            {/* Card scanner (GA). Wrappers tag the selection source (scan/search)
                and scan-result rank for add telemetry. */}
            <CardScanner onSelect={handleScanSelect} />
            <PokemonCardSearch onSelect={handleSearchSelect} />
            {pokemonApiId && (
              <p className="mt-1.5 text-xs text-foreground-muted">
                Card auto-filled — you can still adjust fields below.
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass()}>Card Name</label>
              <input required type="text" placeholder="Charizard" value={name} onChange={(e) => setName(e.target.value)} className={inputClass()} />
            </div>
            <div>
              <label className={labelClass()}>Card Number</label>
              <input type="text" placeholder="4/102" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className={inputClass()} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass()}>Set</label>
              <select
                value={setCode}
                onChange={(e) => handleSetSelect(e.target.value)}
                className={selectClass()}
              >
                {/* tcg:-sourced (JustTCG) promos carry a set name but no pokemontcg
                    set code, so they can't match a dropdown option — surface the
                    scanned set name here instead of a blank "Select set". */}
                <option value="">{cardSet && !setCode ? cardSet : setsLoading ? "Loading sets…" : "Select set"}</option>
                {Object.entries(setsBySeries).map(([series, seriesSets]) => (
                  <optgroup key={series} label={series}>
                    {seriesSets.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-border">
            {imageUrl ? (
              <div className="sm:col-span-2 flex justify-center">
                <Image src={imageUrl} alt={name} width={137} height={192} className="rounded-xl object-contain shadow-lg" />
              </div>
            ) : isPromo ? (
              <div className="sm:col-span-2 flex justify-center">
                <Image src="/img/promo.png" alt="Promo Card" width={137} height={192} className="rounded-xl object-contain shadow-lg" />
              </div>
            ) : null}

            {/* Rarity — auto-filled from the matched card; Promo is a selectable
                option here (there's no separate promo toggle). Custom dropdown so
                the rarity symbol renders on the button and every option. */}
            <div className="sm:col-span-2">
              <label className={labelClass()}>Rarity</label>
              <RaritySelect value={rarity} onChange={applyRarity} />
              {isPromo && (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  Promo — rarity doesn&apos;t determine variant or finish; select both below.
                </p>
              )}
            </div>

            {/* Variant */}
            <div>
              <label className={labelClass()}>Variant</label>
              {isPromo ? (
                <select value={variant} onChange={(e) => setVariant(e.target.value)} className={selectClass()}>
                  <option value="">Select variant</option>
                  {PROMO_VARIANTS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              ) : variantInfo ? (
                <div className={lockedFieldClass()}>
                  <span className="text-sm text-foreground">{variantInfo.variantLabel}</span>
                  <span className="text-xs text-foreground-muted">auto</span>
                </div>
              ) : (
                <div className={lockedFieldClass()}>
                  <span className="text-sm text-foreground-muted">—</span>
                  <span className="text-xs text-foreground-muted">set by rarity</span>
                </div>
              )}
            </div>

            {/* Finish */}
            <div>
              <label className={labelClass()}>Finish</label>
              {isPromo ? (
                <select value={finish} onChange={(e) => setFinish(e.target.value)} className={selectClass()}>
                  <option value="">Select finish</option>
                  {ALL_FINISHES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              ) : printedFinishes.length > 1 ? (
                <select value={finish} onChange={(e) => setFinish(e.target.value)} className={selectClass()}>
                  <option value="">Select finish</option>
                  {printedFinishes.map((value) => (
                    <option key={value} value={value}>{FINISH_LABELS[value] ?? value}</option>
                  ))}
                </select>
              ) : (
                <div className={lockedFieldClass()}>
                  <span className="text-sm text-foreground">{variantInfo?.finishLabel ?? "—"}</span>
                  <span className="text-xs text-foreground-muted">auto</span>
                </div>
              )}
              {printedFinishes.length > 1 && variantInfo && (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  This card exists in more than one printing — pick the one you have.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass()}>Edition</label>
              <select value={edition} onChange={(e) => setEdition(e.target.value)} className={selectClass()}>
                <option value="">Standard</option>
                <option value="1st_edition">1st Edition</option>
                <option value="shadowless">Shadowless</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ownership */}
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Ownership</h2>

          {products.length > 0 && (
            <div>
              <label className={labelClass()}>Pulled From Product <span className="text-foreground-muted font-normal">(optional)</span></label>
              <select value={linkedProduct} onChange={(e) => setLinkedProduct(e.target.value)} className={selectClass()}>
                <option value="">Not linked to a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {linkedProduct && (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  Purchase price is optional — product cost covers this pull&apos;s investment.
                </p>
              )}
            </div>
          )}

          <Toggle on={graded} onToggle={() => setGraded((v) => !v)} label="This card is graded" />

          {graded ? (
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass()}>Grader</label>
                <select value={grader} onChange={(e) => setGrader(e.target.value)} className={selectClass()}>
                  <option value="">Select</option>
                  {GRADERS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass()}>Grade</label>
                <input type="number" placeholder="9.5" step="0.5" min="1" max="10" value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClass()} />
              </div>
              <div>
                <label className={labelClass()}>Cert Number</label>
                <input type="text" placeholder="12345678" value={certNumber} onChange={(e) => setCertNumber(e.target.value)} className={inputClass()} />
              </div>
            </div>
          ) : (
            <div>
              <label className={labelClass()}>Condition</label>
              <div className="grid grid-cols-3 gap-2">
                {CONDITIONS.map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => setCondition(value)}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                      condition === value
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass()}>Quantity</label>
              <div className="flex items-center rounded-xl border border-border bg-surface-raised overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity(String(Math.max(1, Number(quantity) - 1)))}
                  disabled={Number(quantity) <= 1}
                  className="flex items-center justify-center w-12 py-3 border-r border-border text-foreground-muted hover:text-gold hover:bg-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <span className="flex-1 text-center text-sm font-semibold text-foreground py-3 select-none">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(String(Number(quantity) + 1))}
                  className="flex items-center justify-center w-12 py-3 border-l border-border text-foreground-muted hover:text-gold hover:bg-surface transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass()}>Purchase Price ($)</label>
              <input type="number" step="0.01" placeholder="0.00" value={paidPrice} onChange={(e) => setPaidPrice(e.target.value)} className={`${inputClass()} no-spinner`} />
              {priceLoading ? (
                <p className="mt-1.5 text-xs text-foreground-muted">Fetching latest market price…</p>
              ) : computedMarketHint != null ? (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  TCGPlayer market (est.): <span className="font-medium text-foreground">${computedMarketHint.toFixed(2)}</span>
                </p>
              ) : (pokemonApiId || tcgplayerId) ? (
                <p className="mt-1.5 text-xs text-foreground-muted">No market price available yet.</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <Toggle
              on={forSale}
              onToggle={() => {
                const next = !forSale;
                setForSale(next);
                if (next && !listPrice && computedMarketHint != null) {
                  setListPrice(String(computedMarketHint));
                }
              }}
              label="List for Sale"
            />
            <Toggle on={forTrade} onToggle={() => setForTrade((v) => !v)} label="Available to Trade" />
          </div>

          {forSale && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground-muted">List Price ($)</span>
                {computedMarketHint != null && (
                  <button
                    type="button"
                    onClick={() => setListPrice(String(computedMarketHint))}
                    className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs font-medium text-gold hover:bg-gold/15 transition-colors"
                  >
                    mkt · ${computedMarketHint.toFixed(2)}
                  </button>
                )}
              </div>
              <input type="number" step="0.01" placeholder="0.00" value={listPrice} onChange={(e) => setListPrice(e.target.value)} className={`${inputClass()} no-spinner`} />
            </div>
          )}

          <div>
            <label className={labelClass()}>Notes</label>
            <textarea rows={2} placeholder="Any personal notes about this card..." value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass()} resize-none`} />
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="rounded-full bg-gold px-8 py-3 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
          >
            {loading ? "Saving…" : "Add to Vault"}
          </button>
          <Link href="/inventory"
            className="rounded-full border border-border px-8 py-3 text-sm font-semibold text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
