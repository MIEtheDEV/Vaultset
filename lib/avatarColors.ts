export type AvatarColorKey =
  | "gold" | "purple" | "blue" | "teal"
  | "emerald" | "rose" | "orange" | "cyan";

export const AVATAR_COLORS: Record<
  AvatarColorKey,
  { bg: string; border: string; text: string; hex: string; swatch: string; label: string }
> = {
  gold:    { bg: "bg-gold/10",        border: "border-gold/40",        text: "text-gold",        hex: "#d4a72c", swatch: "#d4a72c", label: "Gold"    },
  purple:  { bg: "bg-purple-500/10",  border: "border-purple-500/40",  text: "text-purple-400",  hex: "#a78bfa", swatch: "#a855f7", label: "Purple"  },
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/40",    text: "text-blue-400",    hex: "#60a5fa", swatch: "#3b82f6", label: "Blue"    },
  teal:    { bg: "bg-teal-500/10",    border: "border-teal-500/40",    text: "text-teal-400",    hex: "#2dd4bf", swatch: "#14b8a6", label: "Teal"    },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-400", hex: "#34d399", swatch: "#10b981", label: "Emerald" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/40",    text: "text-rose-400",    hex: "#fb7185", swatch: "#f43f5e", label: "Rose"    },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/40",  text: "text-orange-400",  hex: "#fb923c", swatch: "#f97316", label: "Orange"  },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/40",    text: "text-cyan-400",    hex: "#22d3ee", swatch: "#06b6d4", label: "Cyan"    },
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
