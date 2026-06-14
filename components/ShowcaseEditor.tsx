"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

export type ShowcaseItem = {
  id: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  condition: string | null;
  grader: string | null;
  grade: string | null;
  showcased: boolean;
};

const MAX_SHOWCASE = 12;

const BORDER_OPTIONS = [
  { value: "none", label: "None", cls: "" },
  { value: "foil", label: "Foil", cls: "showcase-foil" },
  { value: "gold", label: "Gold", cls: "showcase-gold" },
];

export function ShowcaseEditor({
  userId,
  initialItems,
  initialBorder = "none",
}: {
  userId: string;
  initialItems: ShowcaseItem[];
  initialBorder?: string;
}) {
  const supabase = createClient();
  const [items, setItems]   = useState<ShowcaseItem[]>(initialItems);
  const [query, setQuery]   = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [border, setBorder] = useState<string>(initialBorder);
  const [savingBorder, setSavingBorder] = useState(false);

  async function saveBorder(value: string) {
    if (savingBorder || value === border) return;
    setSavingBorder(true);
    setBorder(value);
    await supabase.from("profiles").update({ showcase_border: value }).eq("id", userId);
    setSavingBorder(false);
  }

  const pinnedCount = items.filter((i) => i.showcased).length;
  const isFull      = pinnedCount >= MAX_SHOWCASE;

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.set_name ?? "").toLowerCase().includes(q) ||
        (i.card_number ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  async function toggle(item: ShowcaseItem) {
    if (saving) return;
    setSaving(item.id);

    if (item.showcased) {
      await supabase
        .from("profile_showcase")
        .delete()
        .eq("user_id", userId)
        .eq("collection_item_id", item.id);
    } else {
      if (isFull) { setSaving(null); return; }
      await supabase
        .from("profile_showcase")
        .insert({ user_id: userId, collection_item_id: item.id });
    }

    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, showcased: !i.showcased } : i))
    );
    setSaving(null);
  }

  const pinned  = items.filter((i) => i.showcased);
  const unpinned = filtered.filter((i) => !i.showcased);

  return (
    <div className="space-y-8">

      {/* Showcase border (advanced — Pro) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Showcase border</h2>
          <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold">Pro</span>
        </div>
        <p className="text-xs text-foreground-muted">An animated border applied to your showcased cards on your public profile.</p>
        <div className="flex flex-wrap gap-3">
          {BORDER_OPTIONS.map((opt) => {
            const selected = border === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => saveBorder(opt.value)}
                disabled={savingBorder}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors disabled:opacity-60 ${
                  selected ? "border-gold bg-gold/5" : "border-border hover:border-gold/40"
                }`}
              >
                <span className={`h-12 w-9 rounded-md bg-surface-raised ${opt.cls}`} />
                <span className={`text-xs font-medium ${selected ? "text-gold" : "text-foreground-muted"}`}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slot counter */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-muted">
          <span className={`font-semibold ${isFull ? "text-gold" : "text-foreground"}`}>{pinnedCount}</span>
          {" / "}{MAX_SHOWCASE} slots used
        </p>
        {isFull && (
          <span className="text-xs text-gold font-medium">Remove a card to add another</span>
        )}
      </div>

      {/* Current showcase */}
      {pinned.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">In your showcase</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {pinned.map((item) => (
              <ShowcaseCard
                key={item.id}
                item={item}
                onToggle={() => toggle(item)}
                saving={saving === item.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Search + all inventory */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Your inventory</h2>
          <div className="relative flex-1 max-w-xs">
            <svg
              width="14" height="14"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search cards…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-full border border-border bg-surface pl-8 pr-4 py-1.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-gold/50 focus:outline-none"
            />
          </div>
        </div>

        {unpinned.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface py-10 text-center">
            <p className="text-sm text-foreground-muted">
              {query ? "No cards match your search." : "All your cards are in the showcase."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {unpinned.map((item) => (
              <ShowcaseCard
                key={item.id}
                item={item}
                onToggle={() => toggle(item)}
                saving={saving === item.id}
                disabled={isFull}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function ShowcaseCard({
  item,
  onToggle,
  saving,
  disabled = false,
}: {
  item: ShowcaseItem;
  onToggle: () => void;
  saving: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`relative rounded-xl border bg-surface p-2 flex flex-col gap-2 transition-colors ${
      item.showcased ? "border-gold/40 bg-gold/5" : "border-border"
    }`}>
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
            className="object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-foreground-muted text-xs">
            {item.name[0]}
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-foreground truncate leading-tight">{item.name}</p>
        <p className="text-xs text-foreground-muted truncate">{item.set_name ?? ""}</p>
        {item.grader ? (
          <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-xs font-semibold text-gold">
            {item.grader} {item.grade}
          </span>
        ) : item.condition ? (
          <span className="inline-block rounded-full border border-border px-1.5 py-0.5 text-xs text-foreground-muted capitalize">
            {item.condition.replace(/_/g, " ")}
          </span>
        ) : null}
      </div>
      <button
        onClick={onToggle}
        disabled={saving || (disabled && !item.showcased)}
        className={`w-full rounded-lg py-1 text-xs font-medium transition-colors ${
          item.showcased
            ? "border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20"
            : disabled
            ? "border border-border text-foreground-muted opacity-40 cursor-not-allowed"
            : "border border-border text-foreground-muted hover:border-gold/40 hover:text-foreground"
        } ${saving ? "opacity-60" : ""}`}
      >
        {saving ? "…" : item.showcased ? "Remove" : "Add"}
      </button>
    </div>
  );
}
