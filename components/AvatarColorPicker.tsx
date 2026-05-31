"use client";

import { useRef } from "react";
import { AVATAR_COLORS, AVATAR_COLOR_KEYS, isHexColor, type AvatarColorKey } from "@/lib/avatarColors";

export function AvatarColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isCustom = isHexColor(value);

  return (
    <div>
      <p className="mb-2 text-xs text-foreground-muted">Profile colour — used when no photo is set</p>
      <div className="flex flex-wrap gap-2">
        {AVATAR_COLOR_KEYS.map((key) => {
          const { swatch, label } = AVATAR_COLORS[key];
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              title={label}
              aria-label={label}
              aria-pressed={selected}
              style={{ background: swatch }}
              className={`relative h-7 w-7 rounded-full transition-all ${
                selected
                  ? "ring-2 ring-white/60 ring-offset-2 ring-offset-surface scale-110"
                  : "hover:scale-110"
              }`}
            >
              {selected && (
                <svg className="absolute inset-0 m-auto" width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}

        {/* Divider */}
        <div className="w-px self-stretch bg-border mx-1" />

        {/* Custom colour swatch */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground-muted">Choose a custom color:</span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            title="Custom colour"
            aria-label="Custom colour"
            aria-pressed={isCustom}
            style={isCustom ? { background: value } : undefined}
            className={`relative h-7 w-7 rounded-full transition-all overflow-hidden ${
              isCustom
                ? "ring-2 ring-white/60 ring-offset-2 ring-offset-surface scale-110"
                : "hover:scale-110"
            }`}
          >
            {!isCustom && (
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                }}
              />
            )}
            {isCustom && (
              <svg className="absolute inset-0 m-auto" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        </div>

        <input
          ref={inputRef}
          type="color"
          value={isCustom ? value : "#7c3aed"}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
