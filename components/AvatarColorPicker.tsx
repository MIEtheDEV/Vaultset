"use client";

import { AVATAR_COLORS, AVATAR_COLOR_KEYS, isHexColor } from "@/lib/avatarColors";

export function AvatarColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
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
      </div>

      {/* Custom colour swatch.
          The <input type="color"> IS the hit target, sized to the swatch and layered
          on top at opacity 0. It deliberately is NOT proxied behind a button calling
          input.click(): iOS Safari only opens the native colour panel for a real tap
          on the control itself, and ignores a programmatic click on a hidden input —
          so the previous sr-only + aria-hidden + tabIndex={-1} version was dead on
          iOS while working in desktop Chrome/Firefox. The gradient below is
          decoration only (pointer-events-none) so it can't intercept the tap. */}
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-foreground-muted">Choose a custom color:</span>
        <span
          className={`relative inline-block h-7 w-7 rounded-full transition-all focus-within:ring-2 focus-within:ring-gold ${
            isCustom
              ? "ring-2 ring-white/60 ring-offset-2 ring-offset-surface scale-110"
              : "hover:scale-110"
          }`}
        >
          <span
            aria-hidden
            style={isCustom ? { background: value } : {
              background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
            }}
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
          >
            {isCustom && (
              <svg className="absolute inset-0 m-auto" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <input
            type="color"
            value={isCustom ? value : "#7c3aed"}
            onChange={(e) => onChange(e.target.value)}
            title="Custom colour"
            aria-label="Custom colour"
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 opacity-0"
          />
        </span>
      </div>
    </div>
  );
}
