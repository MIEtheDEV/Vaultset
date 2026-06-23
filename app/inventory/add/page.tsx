"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { PokemonCardSearch } from "@/components/PokemonCardSearch";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";
import { PokemonTCGProvider } from "@/lib/search/PokemonTCGProvider";
import type { TcgPlayerData } from "@/lib/search/CardSearchProvider";

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

// Variant options available when promo override is active.
// Promo cards can have any visual design regardless of rarity symbol.
const PROMO_VARIANTS = [
  { value: "standard",                  label: "Standard" },
  { value: "standard_holo",             label: "Standard Holo" },
  { value: "standard_ex",               label: "Standard ex" },
  { value: "full_art",                  label: "Full Art" },
  { value: "illustration_rare",         label: "Illustration Rare (Alt Art)" },
  { value: "special_illustration_rare", label: "Special Illustration Rare (Alt Art ex)" },
  { value: "gold_card",                 label: "Gold Card" },
  { value: "standard_v",                label: "Standard V" },
  { value: "vmax",                      label: "VMAX" },
  { value: "vstar",                     label: "VSTAR" },
];


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
  const [isPromo, setIsPromo] = useState(false);

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
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [duplicateItems, setDuplicateItems] = useState<{ id: string; condition: string | null; grader: string | null; grade: number | null; quantity: number }[]>([]);

  const computedMarketHint = tcgplayerData
    ? searchProvider.getMarketPrice(
        tcgplayerData, finish || null, edition || null,
        graded ? null        : condition || null,
        graded ? grader || null : null,
        graded && grade ? Number(grade) : null,
      )
    : null;

  // Derived from rarity via the rarity system — demonstrates polymorphism:
  // swapping raritySystem for a different game's implementation changes
  // all variant/finish behaviour without touching this component.
  const variantInfo = isPromo ? null : raritySystem.getVariantInfo(rarity);

  function applyRarity(mappedRarity: string) {
    setRarity(mappedRarity);
    if (isPromo) return;
    const info = raritySystem.getVariantInfo(mappedRarity);
    if (info) {
      setVariant(info.variantKey);
      setFinish(info.finishKey);
    } else {
      setVariant("");
      setFinish("");
    }
  }

  function handlePromoToggle() {
    const next = !isPromo;
    setIsPromo(next);
    if (next) {
      setRarity("promo");
      setVariant("");
      setFinish("");
    } else {
      setRarity("");
      setVariant("");
      setFinish("");
    }
  }

  function handlePokemonSelect(card: {
    id: string; name: string; number: string; rarity?: string;
    subtypes?: string[];
    set: { id: string; name: string };
    images: { small: string; large: string };
    tcgplayer?: TcgPlayerData | null;
  }) {
    setDuplicateWarning(false);
    // JustTCG-sourced results carry a "tcg:<productId>" id (no pokemon_api_id).
    if (card.id.startsWith("tcg:")) {
      setPokemonApiId("");
      setTcgplayerId(card.id.slice(4));
    } else {
      setPokemonApiId(card.id);
      setTcgplayerId("");
    }
    setTcgplayerData(card.tcgplayer ?? null);
    setName(card.name);
    setCardSet(card.set.name);
    setSetCode(card.set.id);
    setCardNumber(card.number);
    setImageUrl(card.images.large);

    const detectedPromo = /promo/i.test(card.set.name);
    setIsPromo(detectedPromo);

    if (detectedPromo) {
      setRarity("promo");
      setVariant("");
      // Preselect the finish when the card's pricing data implies a single
      // printing; leave blank (user picks) when it's ambiguous.
      setFinish(promoFinishFromPrices(card.tcgplayer?.prices));
    } else {
      const mappedRarity = card.rarity ? searchProvider.mapRarity(card.rarity.toLowerCase()) : "";
      setRarity(mappedRarity);
      const info = raritySystem.getVariantInfo(mappedRarity);
      if (info) { setVariant(info.variantKey); setFinish(info.finishKey); }
      else       { setVariant(""); setFinish(""); }
    }

    const sub = card.subtypes?.map((s) => s.toLowerCase()) ?? [];
    setIsEx(
      sub.includes("ex") || sub.includes("mega") || sub.includes("gx") ||
      sub.includes("v")  || sub.includes("vmax") || sub.includes("vstar")
    );
  }

  async function checkForDuplicate(): Promise<boolean> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    let matchingCardIds: string[] = [];

    if (pokemonApiId) {
      const { data } = await supabase
        .from("cards")
        .select("id")
        .contains("game_data", { pokemon_api_id: pokemonApiId });
      matchingCardIds = data?.map((c) => c.id) ?? [];
    } else if (name && cardSet) {
      let q = supabase.from("cards").select("id").eq("name", name).eq("set_name", cardSet);
      if (cardNumber) q = q.eq("card_number", cardNumber);
      const { data } = await q;
      matchingCardIds = data?.map((c) => c.id) ?? [];
    }

    if (matchingCardIds.length === 0) return false;

    const { data: existing } = await supabase
      .from("collection_items")
      .select("id, condition, grader, grade, quantity")
      .eq("user_id", user.id)
      .in("card_id", matchingCardIds)
      .is("transfer_status", null)
      .limit(5);

    if ((existing ?? []).length === 0) return false;

    setDuplicateItems(existing ?? []);
    return true;
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
    game_data.is_promo = isPromo;

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

    // Populate the tracked market value through the cache-first engine
    // (bedrock-first, no JustTCG spend) so the card doesn't land with a null
    // market_price when the search payload carried no usable price. Best-effort:
    // the card is already saved, so a failure here must not block the add.
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

    router.push("/inventory");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const isDuplicate = await checkForDuplicate();
    if (isDuplicate) {
      setDuplicateWarning(true);
      return;
    }

    await performSave();
  }

  async function handleAddAnyway() {
    setDuplicateWarning(false);
    await performSave();
  }

  return (
    <div className="space-y-8">
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
            <PokemonCardSearch onSelect={handlePokemonSelect} />
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
                <option value="">{setsLoading ? "Loading sets…" : "Select set"}</option>
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

            {/* Promo toggle */}
            <div className="sm:col-span-2">
              <Toggle on={isPromo} onToggle={handlePromoToggle} label="Promo card" />
              {isPromo && (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  Rarity no longer determines variant or finish — select both manually below.
                </p>
              )}
            </div>

            {/* Rarity — locked to "Promo" when isPromo, otherwise user-selectable */}
            <div className="sm:col-span-2">
              <label className={labelClass()}>Rarity</label>
              {isPromo ? (
                <div className={lockedFieldClass()}>
                  <span className="text-sm text-foreground">Promo</span>
                  <span className="text-xs text-foreground-muted">auto</span>
                </div>
              ) : (
                <select value={rarity} onChange={(e) => applyRarity(e.target.value)} className={selectClass()}>
                  <option value="">Select rarity</option>
                  {raritySystem.getRarityOptions().map(({ group, options }) => (
                    <optgroup key={group} label={group}>
                      {options.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
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
              ) : variantInfo ? (
                <div className={lockedFieldClass()}>
                  <span className="text-sm text-foreground">{variantInfo.finishLabel}</span>
                  <span className="text-xs text-foreground-muted">auto</span>
                </div>
              ) : (
                <select value={finish} onChange={(e) => setFinish(e.target.value)} className={selectClass()}>
                  <option value="">Select finish</option>
                  {SELECTABLE_FINISHES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
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
            <div className="flex items-center h-full pt-6">
              <Toggle on={isEx} onToggle={() => setIsEx((v) => !v)} label="ex card" />
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
                  Purchase price is optional — product cost covers this pull's investment.
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
              {computedMarketHint != null && (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  TCGPlayer market (est.): <span className="font-medium text-foreground">${computedMarketHint.toFixed(2)}</span>
                </p>
              )}
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

        {duplicateWarning && (
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-yellow-400">This card is already in your vault.</p>
              <p className="mt-1 text-sm text-foreground-muted">
                You can add another entry (e.g. a different condition, grade, or price) or go back to review your existing {duplicateItems.length === 1 ? "copy" : "copies"}.
              </p>
            </div>
            {duplicateItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Existing {duplicateItems.length === 1 ? "copy" : "copies"}</p>
                {duplicateItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/inventory/${item.id}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm hover:border-gold/30 transition-colors"
                  >
                    <span className="text-foreground-muted capitalize">
                      {item.grader
                        ? `${item.grader} ${item.grade}`
                        : (item.condition?.replace(/_/g, " ") ?? "Unknown condition")}
                      {item.quantity > 1 ? ` · ×${item.quantity}` : ""}
                    </span>
                    <span className="text-xs text-gold">View →</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAddAnyway}
                disabled={loading}
                className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-background hover:bg-gold-light disabled:opacity-60 transition-colors"
              >
                {loading ? "Saving…" : "Add Anyway"}
              </button>
              <button
                type="button"
                onClick={() => setDuplicateWarning(false)}
                className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-foreground-muted hover:text-foreground hover:border-gold/40 transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        )}

        {!duplicateWarning && (
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
        )}
      </form>
    </div>
  );
}
