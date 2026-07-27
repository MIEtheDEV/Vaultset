/**
 * Avatar palette — eight options chosen for maximum perceptual separation, because
 * these double as *identity* colours: `resolveAvatarColor` hash-assigns one to every
 * user who hasn't picked, so two arbitrary collectors need to look different.
 *
 * The selection rule is hue spacing. Listed in hue order with the gap to the next:
 *
 *   gold     44°  → +98
 *   green   142°  → +50
 *   cyan    192°  → +47   ← tightest pair
 *   indigo  239°  → +53
 *   fuchsia 292°  → +58
 *   rose    350°  → +54 (wraps to gold)
 *
 * Minimum separation 47°. The previous palette ranged from 13° to 116°: emerald (160°)
 * and teal (173°) sat 13° apart with cyan (192°) crowding the same band — three of
 * eight options inside 32° — while gold (45°) and orange (25°) were 20° apart and
 * nothing at all occupied lime or magenta.
 *
 * SIX, not eight, is deliberate. Hue separation is bounded by how many colours share
 * the circle: brute-forcing every Tailwind hue family gives a best-possible minimum of
 * 31° at eight colours, 40° at seven, and 47° at six. Eight can't be made drastically
 * distinct — the ceiling is the count, not the picks. Six unmistakable presets plus the
 * custom picker beats eight presets where two look like a rendering glitch.
 *
 * If you add a colour, run the gap check first and expect the minimum to drop; under
 * ~30° reads as a duplicate swatch, which is the bug this palette exists to fix.
 *
 * `swatch` is the Tailwind 500 shade (the picker dot); `hex` is the 400 shade, used as
 * text/tint/border against dark surfaces — never as a fill behind white text.
 */
export type AvatarColorKey =
  | "gold" | "green" | "cyan"
  | "indigo" | "fuchsia" | "rose";

export const AVATAR_COLORS: Record<
  AvatarColorKey,
  { bg: string; border: string; text: string; hex: string; swatch: string; label: string }
> = {
  gold:    { bg: "bg-gold/10",         border: "border-gold/40",         text: "text-gold",         hex: "#d4a72c", swatch: "#d4a72c", label: "Gold"    },
  green:   { bg: "bg-green-500/10",    border: "border-green-500/40",    text: "text-green-400",    hex: "#4ade80", swatch: "#22c55e", label: "Green"   },
  cyan:    { bg: "bg-cyan-500/10",     border: "border-cyan-500/40",     text: "text-cyan-400",     hex: "#22d3ee", swatch: "#06b6d4", label: "Cyan"    },
  indigo:  { bg: "bg-indigo-500/10",   border: "border-indigo-500/40",   text: "text-indigo-400",   hex: "#818cf8", swatch: "#6366f1", label: "Indigo"  },
  fuchsia: { bg: "bg-fuchsia-500/10",  border: "border-fuchsia-500/40",  text: "text-fuchsia-400",  hex: "#e879f9", swatch: "#d946ef", label: "Fuchsia" },
  rose:    { bg: "bg-rose-500/10",     border: "border-rose-500/40",     text: "text-rose-400",     hex: "#fb7185", swatch: "#f43f5e", label: "Rose"    },
};

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS) as AvatarColorKey[];

export function isHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

export function resolveAvatarColor(stored: string | null, username: string): AvatarColorKey {
  if (stored && stored in AVATAR_COLORS) return stored as AvatarColorKey;
  const hash = username.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_KEYS[hash % AVATAR_COLOR_KEYS.length];
}

export function resolveAvatarHex(stored: string | null, username: string): string {
  if (stored && isHexColor(stored)) return stored;
  return AVATAR_COLORS[resolveAvatarColor(stored, username)].hex;
}
