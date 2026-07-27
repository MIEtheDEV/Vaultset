import { AVATAR_COLORS, AVATAR_COLOR_KEYS, resolveAvatarColor, resolveAvatarHex } from "@/lib/avatarColors";

/** Hue angle in degrees for a #rrggbb string. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r ? ((g - b) / d) % 6 :
    max === g ? (b - r) / d + 2 :
                (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** Gap in degrees from each swatch to the next one round the colour wheel. */
function hueGaps(): number[] {
  const hues = AVATAR_COLOR_KEYS.map((k) => hue(AVATAR_COLORS[k].swatch)).sort((a, b) => a - b);
  return hues.map((h, i) => (((hues[(i + 1) % hues.length] - h) % 360) + 360) % 360);
}

describe("avatar palette", () => {
  // These colours double as identity colours — resolveAvatarColor hash-assigns one to
  // every user who hasn't picked — so two arbitrary users must not look alike. The old
  // palette had a 13° pair (emerald/teal) that read as the same swatch. 30° is the
  // floor at which two swatches stop looking like a rendering glitch.
  it("keeps every pair of swatches at least 30° apart in hue", () => {
    const gaps = hueGaps();
    const min = Math.min(...gaps);
    const report = AVATAR_COLOR_KEYS.map((k) => `${k}=${Math.round(hue(AVATAR_COLORS[k].swatch))}°`).join(" ");
    expect(`${min >= 30 ? "ok" : `too close (${Math.round(min)}°)`} — ${report}`).toMatch(/^ok/);
  });

  it("spreads roughly evenly rather than clustering", () => {
    // Bounded spread: no gap more than ~2.5x the smallest. Catches "five colours bunched
    // on one side of the wheel plus one outlier", which the min-gap check alone allows.
    const gaps = hueGaps();
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(2.5);
  });

  it("exposes a label and both shades for every key", () => {
    for (const key of AVATAR_COLOR_KEYS) {
      const c = AVATAR_COLORS[key];
      expect(c.label).toBeTruthy();
      expect(c.swatch).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  describe("resolveAvatarColor", () => {
    it("honours a stored key", () => {
      expect(resolveAvatarColor("rose", "anyone")).toBe("rose");
    });

    it("falls back to a hash of the username when the key is unknown or missing", () => {
      // Retired keys (emerald, teal, orange…) must degrade to a valid colour, not crash.
      expect(AVATAR_COLOR_KEYS).toContain(resolveAvatarColor("emerald", "someone"));
      expect(AVATAR_COLOR_KEYS).toContain(resolveAvatarColor(null, "someone"));
    });

    it("is stable for the same username", () => {
      expect(resolveAvatarColor(null, "ashk")).toBe(resolveAvatarColor(null, "ashk"));
    });
  });

  describe("resolveAvatarHex", () => {
    it("passes a custom hex straight through", () => {
      expect(resolveAvatarHex("#1a2b3c", "anyone")).toBe("#1a2b3c");
    });

    it("maps a stored key to its hex", () => {
      expect(resolveAvatarHex("rose", "anyone")).toBe(AVATAR_COLORS.rose.hex);
    });
  });
});
