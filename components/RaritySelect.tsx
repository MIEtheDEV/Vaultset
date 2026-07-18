"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getRaritySystem } from "@/lib/rarity";
import { RaritySymbol } from "@/components/RaritySymbol";

// A rarity picker that shows the symbol + title for the selected value and for
// every option. Replaces a native <select>, which can't render SVG inside its
// <option>s. Grouped (modern / legacy), keyboard-navigable, closes on outside
// click / Escape.
interface RaritySelectProps {
  value: string;
  onChange: (value: string) => void;
  game?: string;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function RaritySelect({
  value,
  onChange,
  game = "pokemon",
  placeholder = "Select rarity",
  className,
  id,
}: RaritySelectProps) {
  const system = getRaritySystem(game);
  const groups = useMemo(() => system.getRarityOptions(), [system]);
  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // highlighted index into `flat`
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedLabel = value ? system.getDisplayLabel(value) : "";

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Open the menu with the current selection highlighted.
  function openMenu() {
    const idx = flat.findIndex((o) => o.value === value);
    setActive(idx >= 0 ? idx : 0);
    setOpen(true);
  }

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = flat[active];
      if (o) choose(o.value);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        id={id}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          {value ? (
            <>
              <RaritySymbol rarity={value} game={game} />
              <span className="truncate">{selectedLabel}</span>
            </>
          ) : (
            <span className="text-foreground-muted">{placeholder}</span>
          )}
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className={`h-4 w-4 flex-none text-foreground-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
        >
          {groups.map((g) => (
            <div key={g.group}>
              <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                {g.group}
              </div>
              {g.options.map((o) => {
                const idx = flat.findIndex((f) => f.value === o.value);
                const isSelected = o.value === value;
                const isActive = idx === active;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose(o.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      isActive ? "bg-gold/10" : ""
                    } ${isSelected ? "text-gold" : "text-foreground"}`}
                  >
                    <RaritySymbol rarity={o.value} game={game} />
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
