"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type PokemonSet = {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
  total?: number;
  printedTotal?: number;
};

type CollectionType = "set" | "rarity" | "custom";

const TYPE_OPTIONS: { value: CollectionType; label: string; description: string }[] = [
  { value: "set",    label: "Set",    description: "Your cards from a set" },
  { value: "rarity", label: "Rarity", description: "Hunt a rarity across sets" },
  { value: "custom", label: "Custom", description: "Manually curate" },
];

const RARITY_OPTIONS: { value: string; label: string }[] = [
  { value: "special_illustration_rare", label: "Special Illustration Rare" },
  { value: "illustration_rare",         label: "Illustration Rare" },
  { value: "hyper_rare",                label: "Mega Hyper Rare" },
  { value: "ultra_rare",                label: "Ultra Rare" },
  { value: "double_rare",               label: "Double Rare" },
  { value: "ace_spec_rare",             label: "ACE SPEC Rare" },
  { value: "secret_rare",               label: "Secret Rare" },
  { value: "rare_rainbow",              label: "Rare Rainbow" },
  { value: "rare_shiny_gx",             label: "Rare Shiny GX" },
  { value: "rare_shiny",                label: "Rare Shiny" },
  { value: "rare_holo",                 label: "Rare Holo" },
];

export function CollectionCreator() {
  const router = useRouter();

  const [type, setType]           = useState<CollectionType>("set");
  const [typeValue, setTypeValue] = useState("");
  const [cardTotal, setCardTotal] = useState<number | null>(null);
  const [name, setName]           = useState("");
  const [sets, setSets]           = useState<PokemonSet[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [setsLoading, setSetsLoading] = useState(false);

  useEffect(() => {
    if (type !== "set") return;
    setSetsLoading(true);
    fetch("/api/pokemon-sets")
      .then((r) => r.json())
      .then((d) => setSets(d.data ?? []))
      .finally(() => setSetsLoading(false));
  }, [type]);

  useEffect(() => {
    if (type === "set" && typeValue) {
      setName(typeValue);
    } else if (type === "rarity" && typeValue) {
      const r = RARITY_OPTIONS.find((o) => o.value === typeValue);
      setName(r?.label ?? typeValue);
    } else if (type === "custom") {
      setName("");
    }
  }, [type, typeValue]);

  function handleSetChange(selectedName: string) {
    setTypeValue(selectedName);
    const s = sets.find((s) => s.name === selectedName);
    setCardTotal(s?.total ?? null);
  }

  function handleTypeChange(t: CollectionType) {
    setType(t);
    setTypeValue("");
    setCardTotal(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (type !== "custom" && !typeValue) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/collections", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name,
          type,
          type_value: typeValue  || undefined,
          card_total: cardTotal  ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create collection");
        return;
      }
      router.push(`/collections/${data.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">

      {/* Type selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Collection type</label>
        <div className="grid grid-cols-3 gap-2">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleTypeChange(t.value)}
              className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors text-left ${
                type === t.value
                  ? "border-gold/60 bg-gold/10 text-gold"
                  : "border-border text-foreground-muted hover:border-border/80 hover:text-foreground"
              }`}
            >
              <p className="font-semibold">{t.label}</p>
              <p className="mt-0.5 text-xs opacity-70 leading-tight">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Set picker */}
      {type === "set" && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Set</label>
          {setsLoading ? (
            <p className="text-sm text-foreground-muted">Loading sets…</p>
          ) : (
            <select
              value={typeValue}
              onChange={(e) => handleSetChange(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground focus:border-gold/50 focus:outline-none"
            >
              <option value="">Select a set…</option>
              {sets.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name} ({s.releaseDate?.slice(0, 4)})
                  {s.total ? ` — ${s.total} cards` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Rarity picker */}
      {type === "rarity" && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Rarity</label>
          <select
            value={typeValue}
            onChange={(e) => setTypeValue(e.target.value)}
            required
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground focus:border-gold/50 focus:outline-none"
          >
            <option value="">Select a rarity…</option>
            {RARITY_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Collection name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Surging Sparks Set"
          required
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold/50 focus:outline-none"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || !name.trim() || (type !== "custom" && !typeValue)}
        className="w-full rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Building collection…
          </span>
        ) : "Create collection"}
      </button>

    </form>
  );
}
