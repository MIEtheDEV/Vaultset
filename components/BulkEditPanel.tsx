"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PokemonRaritySystem } from "@/lib/rarity/PokemonRaritySystem";
import {
  RARITY_NONE,
  ROUND_MODES,
  isFilterEmpty,
  type BulkAction,
  type BulkActionType,
  type BulkFilter,
  type BulkPreview,
  type RoundMode,
} from "@/lib/bulk/types";
import { previewBulkEdit, applyBulkEdit, undoBulkEdit } from "@/app/inventory/bulk-actions";

const raritySystem = new PokemonRaritySystem();

const conditionLabel: Record<string, string> = {
  mint: "Mint",
  near_mint: "Near Mint",
  lightly_played: "Lightly Played",
  moderately_played: "Moderately Played",
  heavily_played: "Heavily Played",
  damaged: "Damaged",
};

const ACTIONS: { value: BulkActionType; label: string }[] = [
  { value: "price_market_pct", label: "Set price relative to market value" },
  { value: "price_list_pct",   label: "Adjust current listing price" },
  { value: "clear_list_price", label: "Clear listing price" },
  { value: "set_for_sale",     label: "For sale — list / unlist" },
  { value: "set_for_trade",    label: "For trade — mark / unmark" },
];

export interface BulkFacets {
  sets: string[];
  rarities: string[];
  conditions: string[];
}

type TriState = "" | "yes" | "no";

function triToBool(v: TriState): boolean | undefined {
  return v === "" ? undefined : v === "yes";
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Chip-style multiselect. Selecting nothing means "no constraint on this axis". */
function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ value, label }) => {
        const on = selected.has(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              on
                ? "border-gold bg-gold/10 text-gold"
                : "border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-muted">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors";

/**
 * Bulk Edit (Pro) — build a filter, see exactly what it will touch, apply it,
 * undo it.
 *
 * Selection is a predicate, not a list of ticked boxes, so an edit reaches every
 * matching card rather than only the ones currently on screen. The preview is
 * not decoration: a filter-driven edit is invisible until it's wrong, so nothing
 * applies until the user has seen the count and confirmed it.
 */
export function BulkEditPanel({ facets, canPro }: { facets: BulkFacets; canPro: boolean }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);

  // Filter state
  const [sets, setSets]             = useState<Set<string>>(new Set());
  const [rarities, setRarities]     = useState<Set<string>>(new Set());
  const [conditions, setConditions] = useState<Set<string>>(new Set());
  const [minValue, setMinValue]     = useState("");
  const [maxValue, setMaxValue]     = useState("");
  const [forSale, setForSale]       = useState<TriState>("");
  const [forTrade, setForTrade]     = useState<TriState>("");
  const [graded, setGraded]         = useState<TriState>("");
  const [showMore, setShowMore]     = useState(false);

  // Action state
  const [actionType, setActionType] = useState<BulkActionType>("price_market_pct");
  const [pct, setPct]               = useState("-5");
  const [floor, setFloor]           = useState("0.25");
  const [round, setRound]           = useState<RoundMode>("cent");
  const [flagValue, setFlagValue]   = useState(true);

  // Preview / apply state. The preview is stored with the signature of the
  // filter+action it describes, so a count can never be shown — or applied —
  // against criteria it wasn't computed for.
  const [previewState, setPreviewState] = useState<{ sig: string; data: BulkPreview } | null>(null);
  const [previewing, setPreviewing]     = useState(false);
  const [error, setError]               = useState("");
  const [confirming, setConfirming]     = useState(false);
  const [applying, setApplying]         = useState(false);
  const [result, setResult]             = useState<{ batchId: string | null; updated: number; description: string } | null>(null);
  const [undoing, setUndoing]           = useState(false);
  const [undone, setUndone]             = useState<number | null>(null);
  // Bumped after a write so the preview re-runs against the new state — an
  // "Apply to 143 cards" button left over from before the edit is a trap.
  const [refreshKey, setRefreshKey]     = useState(0);

  const setOptions = useMemo(
    () => facets.sets.map((s) => ({ value: s, label: s })),
    [facets.sets],
  );

  const rarityOptions = useMemo(
    () =>
      [...facets.rarities]
        .sort((a, b) => raritySystem.getSortOrder(a) - raritySystem.getSortOrder(b))
        .map((r) => ({
          value: r,
          label: r === RARITY_NONE ? "No rarity recorded" : raritySystem.getDisplayLabel(r),
        })),
    [facets.rarities],
  );

  const conditionOptions = useMemo(
    () => facets.conditions.map((c) => ({ value: c, label: conditionLabel[c] ?? c })),
    [facets.conditions],
  );

  const isPriceAction = actionType === "price_market_pct" || actionType === "price_list_pct";
  const isFlagAction  = actionType === "set_for_sale" || actionType === "set_for_trade";

  const filter = useMemo<BulkFilter>(() => {
    const f: BulkFilter = {};
    if (sets.size)       f.sets = [...sets];
    if (rarities.size)   f.rarities = [...rarities];
    if (conditions.size) f.conditions = [...conditions];
    if (minValue.trim() !== "" && Number.isFinite(Number(minValue))) f.minValue = Number(minValue);
    if (maxValue.trim() !== "" && Number.isFinite(Number(maxValue))) f.maxValue = Number(maxValue);
    const fs = triToBool(forSale);
    const ft = triToBool(forTrade);
    const g  = triToBool(graded);
    if (fs !== undefined) f.forSale  = fs;
    if (ft !== undefined) f.forTrade = ft;
    if (g  !== undefined) f.graded   = g;
    return f;
  }, [sets, rarities, conditions, minValue, maxValue, forSale, forTrade, graded]);

  const action = useMemo<BulkAction>(() => {
    if (isPriceAction) {
      return {
        type: actionType as "price_market_pct" | "price_list_pct",
        pct: Number(pct) || 0,
        floor: floor.trim() === "" ? null : Number(floor),
        round,
      };
    }
    if (isFlagAction) {
      return { type: actionType as "set_for_sale" | "set_for_trade", value: flagValue };
    }
    return { type: "clear_list_price" };
  }, [actionType, pct, floor, round, flagValue, isPriceAction, isFlagAction]);

  const signature = useMemo(() => JSON.stringify([filter, action]), [filter, action]);

  // Any edit to the filter or action invalidates a pending confirmation and the
  // previous run's undo offer — confirming a count you can no longer see would
  // be the exact failure this panel exists to prevent. Adjusted during render
  // rather than in an effect so the stale confirmation is never paintable.
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setConfirming(false);
    setResult(null);
    setUndone(null);
  }

  // Only trust a preview computed for the criteria currently on screen.
  const preview = previewState?.sig === signature ? previewState.data : null;

  // Debounced live preview. A request id guards against a slow early response
  // landing after a fast later one and showing a stale count.
  const requestId = useRef(0);
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;

    const t = setTimeout(async () => {
      setPreviewing(true);
      setError("");
      try {
        const p = await previewBulkEdit(filter, action);
        if (id === requestId.current) setPreviewState({ sig: signature, data: p });
      } catch (e) {
        if (id === requestId.current) {
          setPreviewState(null);
          setError(e instanceof Error ? e.message : "Preview failed");
        }
      } finally {
        if (id === requestId.current) setPreviewing(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [open, filter, action, signature, refreshKey]);

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    return (value: string) =>
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
  }

  function resetFilter() {
    setSets(new Set());
    setRarities(new Set());
    setConditions(new Set());
    setMinValue("");
    setMaxValue("");
    setForSale("");
    setForTrade("");
    setGraded("");
  }

  async function handleApply() {
    setApplying(true);
    setError("");
    try {
      const r = await applyBulkEdit(filter, action);
      setResult(r);
      setConfirming(false);
      // Drop the now-stale count so nothing can be applied against it while the
      // fresh preview is in flight.
      setPreviewState(null);
      setRefreshKey((k) => k + 1);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setApplying(false);
    }
  }

  async function handleUndo() {
    if (!result?.batchId) return;
    setUndoing(true);
    setError("");
    try {
      const restored = await undoBulkEdit(result.batchId);
      setUndone(restored);
      setResult(null);
      // Drop the now-stale count so nothing can be applied against it while the
      // fresh preview is in flight.
      setPreviewState(null);
      setRefreshKey((k) => k + 1);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setUndoing(false);
    }
  }

  const unconstrained = isFilterEmpty(filter);
  const nothingToDo   = !preview || preview.applicable === 0;

  return (
    <div className="rounded-2xl border border-border bg-surface">

      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
      >
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            Bulk Edit
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
              Pro
            </span>
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Update price, sale, and trade status across a whole set or rarity at once.
          </p>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-foreground-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-4 py-5">

          {/* ── 1. Which cards ─────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                1 · Which cards
              </p>
              {!unconstrained && (
                <button
                  type="button"
                  onClick={resetFilter}
                  className="text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                  Reset filters
                </button>
              )}
            </div>

            {setOptions.length > 0 && (
              <Field label="Sets">
                <ChipGroup options={setOptions} selected={sets} onToggle={toggle(setSets)} />
              </Field>
            )}

            {rarityOptions.length > 0 && (
              <Field label="Rarities">
                <ChipGroup options={rarityOptions} selected={rarities} onToggle={toggle(setRarities)} />
              </Field>
            )}

            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="text-xs text-gold hover:text-gold-light transition-colors"
            >
              {showMore ? "Fewer filters" : "More filters — value, listing status, condition"}
            </button>

            {showMore && (
              <div className="space-y-3 rounded-xl border border-border bg-surface-raised/40 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Market value from ($)">
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal" placeholder="Any"
                      value={minValue} onChange={(e) => setMinValue(e.target.value)} className={inputClass}
                    />
                  </Field>
                  <Field label="Market value to ($)">
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal" placeholder="Any"
                      value={maxValue} onChange={(e) => setMaxValue(e.target.value)} className={inputClass}
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Currently for sale">
                    <select value={forSale} onChange={(e) => setForSale(e.target.value as TriState)} className={inputClass}>
                      <option value="">Any</option>
                      <option value="yes">Listed for sale</option>
                      <option value="no">Not for sale</option>
                    </select>
                  </Field>
                  <Field label="Currently for trade">
                    <select value={forTrade} onChange={(e) => setForTrade(e.target.value as TriState)} className={inputClass}>
                      <option value="">Any</option>
                      <option value="yes">Marked for trade</option>
                      <option value="no">Not for trade</option>
                    </select>
                  </Field>
                  <Field label="Graded">
                    <select value={graded} onChange={(e) => setGraded(e.target.value as TriState)} className={inputClass}>
                      <option value="">Any</option>
                      <option value="yes">Graded only</option>
                      <option value="no">Raw only</option>
                    </select>
                  </Field>
                </div>
                {conditionOptions.length > 0 && (
                  <Field label="Condition">
                    <ChipGroup options={conditionOptions} selected={conditions} onToggle={toggle(setConditions)} />
                  </Field>
                )}
              </div>
            )}

            {unconstrained && (
              <p className="text-xs text-amber-400">
                No filters set — this will apply to your entire collection.
              </p>
            )}
          </div>

          {/* ── 2. What to change ──────────────────────────────────────── */}
          <div className="space-y-3 border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              2 · What to change
            </p>

            <Field label="Action">
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as BulkActionType)}
                className={inputClass}
              >
                {ACTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>

            {isPriceAction && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={actionType === "price_market_pct" ? "Percent of market value" : "Percent change"}>
                    <div className="relative">
                      <input
                        type="number" step="1" inputMode="decimal"
                        value={pct} onChange={(e) => setPct(e.target.value)}
                        className={`${inputClass} w-full pr-7`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">%</span>
                    </div>
                  </Field>
                  <Field label="Never price below ($)">
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal" placeholder="No minimum"
                      value={floor} onChange={(e) => setFloor(e.target.value)} className={inputClass}
                    />
                  </Field>
                  <Field label="Round to">
                    <select value={round} onChange={(e) => setRound(e.target.value as RoundMode)} className={inputClass}>
                      {ROUND_MODES.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="text-xs text-foreground-muted">
                  {actionType === "price_market_pct"
                    ? "Anchored to each card's tracked market value, so running it twice gives the same result."
                    : "Compounds — running −10% twice leaves you at −19% of the original price."}
                </p>
              </>
            )}

            {isFlagAction && (
              <Field label="Set to">
                <select
                  value={flagValue ? "yes" : "no"}
                  onChange={(e) => setFlagValue(e.target.value === "yes")}
                  className={inputClass}
                >
                  <option value="yes">{actionType === "set_for_sale" ? "Listed for sale" : "Marked for trade"}</option>
                  <option value="no">{actionType === "set_for_sale" ? "Not for sale" : "Not for trade"}</option>
                </select>
              </Field>
            )}

            {actionType === "clear_list_price" && (
              <p className="text-xs text-foreground-muted">
                Removes the listing price. Tracked market values are left untouched.
              </p>
            )}
          </div>

          {/* ── 3. Preview + apply ─────────────────────────────────────── */}
          <div className="space-y-3 border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              3 · Review
            </p>

            <div className="rounded-xl border border-border bg-surface-raised/40 p-3 text-sm">
              {previewing && !preview && <p className="text-foreground-muted">Checking…</p>}
              {preview && (
                <div className="space-y-1.5">
                  <p className={previewing ? "text-foreground-muted" : "text-foreground"}>
                    <span className="font-semibold">{preview.applicable}</span>{" "}
                    card{preview.applicable === 1 ? "" : "s"} will be updated
                  </p>
                  {isPriceAction && preview.applicable > 0 && (
                    <p className="text-xs text-foreground-muted">
                      Total listed value{" "}
                      <span className="text-foreground">{money(preview.currentValue)}</span>
                      {" → "}
                      <span className={preview.projectedValue >= preview.currentValue ? "text-emerald-400" : "text-red-400"}>
                        {money(preview.projectedValue)}
                      </span>
                    </p>
                  )}
                  {preview.skippedNoValue > 0 && (
                    <p className="text-xs text-foreground-muted">
                      {preview.skippedNoValue} skipped — no{" "}
                      {actionType === "price_market_pct" ? "tracked market value" : "listing price"} to work from
                    </p>
                  )}
                  {preview.locked > 0 && (
                    <p className="text-xs text-amber-400">
                      {preview.locked} skipped — on hold or in an open offer
                    </p>
                  )}
                </div>
              )}
              {!preview && !previewing && !error && (
                <p className="text-foreground-muted">No cards match these filters.</p>
              )}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            {undone != null && (
              <p className="text-xs text-emerald-400">
                Reverted {undone} card{undone === 1 ? "" : "s"}.
              </p>
            )}

            {/* Result + undo */}
            {result && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-sm text-emerald-400">
                  {result.description} — {result.updated} card{result.updated === 1 ? "" : "s"} updated.
                </p>
                {result.batchId && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={undoing}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground-muted hover:border-gold/40 hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {undoing ? "Undoing…" : "Undo"}
                  </button>
                )}
              </div>
            )}

            {/* Apply */}
            {!canPro ? (
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm font-medium text-gold hover:bg-gold/20 transition-colors"
              >
                Upgrade to Pro to apply bulk edits →
              </Link>
            ) : !confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={nothingToDo || previewing}
                className="rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-sm font-medium text-gold hover:bg-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply to {preview?.applicable ?? 0} card{preview?.applicable === 1 ? "" : "s"}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                  className="rounded-full border border-gold/40 bg-gold/20 px-5 py-2.5 text-sm font-semibold text-gold hover:bg-gold/30 transition-colors disabled:opacity-50"
                >
                  {applying ? "Updating…" : `Confirm — update ${preview?.applicable ?? 0}`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
