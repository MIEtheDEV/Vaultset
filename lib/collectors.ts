import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared shape for a collector as shown in community surfaces (search results,
 * the new-collector welcome row, leaderboards). Everything here is data the
 * `profiles` table already grants to `anon`, plus three public aggregate counts —
 * collection *value* is deliberately absent, since that stays private.
 */
export type CollectorSummary = {
  id: string;
  username: string;
  /** Public form of the real name, or null when the owner keeps it hidden. */
  display_name: string | null;
  created_at: string;
  city: string | null;
  specialty: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  is_pro: boolean | null;
  pro_plan: string | null;
  pro_expires_at: string | null;
  is_supporter: boolean | null;
  followers: number;
  cards: number;
  listings: number;
};

/**
 * The `profiles` columns a `CollectorSummary` needs. Keep in sync with the type.
 *
 * `display_name_public` — never `first_name`/`last_name`. Those carry no
 * anon/authenticated SELECT grant precisely so that a name part its owner chose
 * to hide can't be read (or confirmed by searching for it); the generated column
 * is the only public view of a real name.
 */
export const COLLECTOR_COLUMNS =
  "id, username, display_name_public, created_at, city, specialty, avatar_url, avatar_color, is_pro, pro_plan, pro_expires_at, is_supporter";

export type CollectorProfileRow = {
  id: string;
  username: string;
  display_name_public?: string | null;
  created_at: string;
  city?: string | null;
  specialty?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  is_pro?: boolean | null;
  pro_plan?: string | null;
  pro_expires_at?: string | null;
  is_supporter?: boolean | null;
};

export type CollectorCounts = { followers: number; cards: number; listings: number };

export function toCollectorSummary(
  p: CollectorProfileRow,
  counts: Partial<CollectorCounts> = {},
): CollectorSummary {
  return {
    id: p.id,
    username: p.username,
    display_name: p.display_name_public ?? null,
    created_at: p.created_at,
    city: p.city ?? null,
    specialty: p.specialty ?? null,
    avatar_url: p.avatar_url ?? null,
    avatar_color: p.avatar_color ?? null,
    is_pro: p.is_pro ?? false,
    pro_plan: p.pro_plan ?? null,
    pro_expires_at: p.pro_expires_at ?? null,
    is_supporter: p.is_supporter ?? false,
    followers: counts.followers ?? 0,
    cards: counts.cards ?? 0,
    listings: counts.listings ?? 0,
  };
}

/**
 * Follower / card / listing counts for a *bounded* set of collector ids.
 *
 * Card counts come from the `collector_collection_stats()` aggregate rather than
 * a raw `collection_items` select: PostgREST caps any raw select at 1000 rows
 * server-side (see the pricing notes in CLAUDE.md), so summing quantities client
 * -side would silently undercount anyone with a large collection. The listing
 * query stays raw because it's filtered to for-sale/for-trade rows for at most a
 * screenful of collectors, which is nowhere near the cap.
 */
export async function fetchCollectorCounts(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, CollectorCounts>> {
  const counts = new Map<string, CollectorCounts>();
  if (ids.length === 0) return counts;

  const bump = (id: string, key: keyof CollectorCounts, by: number) => {
    const row = counts.get(id) ?? { followers: 0, cards: 0, listings: 0 };
    row[key] += by;
    counts.set(id, row);
  };

  const [{ data: follows }, { data: listings }, { data: stats }] = await Promise.all([
    admin.from("follows").select("following_id").in("following_id", ids),
    admin
      .from("collection_items")
      .select("user_id, quantity")
      .in("user_id", ids)
      .or("for_sale.eq.true,for_trade.eq.true"),
    admin.rpc("collector_collection_stats"),
  ]);

  follows?.forEach((f: { following_id: string }) => bump(f.following_id, "followers", 1));
  listings?.forEach((l: { user_id: string; quantity: number | null }) =>
    bump(l.user_id, "listings", l.quantity ?? 1));

  const wanted = new Set(ids);
  (stats ?? []).forEach((s: { user_id: string; collection_size: number | string }) => {
    if (wanted.has(s.user_id)) bump(s.user_id, "cards", Number(s.collection_size) || 0);
  });

  return counts;
}

/**
 * Whether a signup is recent enough for the community welcome row.
 *
 * Lives here rather than inline in the page because reading the clock during a
 * component render is an impurity the React lint rules (correctly) flag — the
 * check is the same either way, but the page stays a pure function of its data.
 */
export function isNewCollector(createdAt: string, windowDays = 30): boolean {
  return Date.now() - new Date(createdAt).getTime() <= windowDays * 86_400_000;
}

/**
 * Sanitize a free-text collector query for interpolation into a PostgREST
 * `or=(...)` filter.
 *
 * Only `"` and `\` are dropped: the caller wraps each value in double quotes,
 * which is what lets a term keep the `,` `(` `)` `.` that would otherwise break
 * out of the `or(...)` grammar — so a city pasted verbatim ("Boise, ID") still
 * matches. `%` and `*` go too, since they're LIKE wildcards the caller supplies
 * itself. `_` is left alone on purpose: it's a legal username character, and as
 * a wildcard it only ever *widens* the result set, so `brandon_m` still finds
 * `brandon_m`.
 */
export function sanitizeCollectorQuery(raw: string): string {
  return raw.trim().slice(0, 40).replace(/[%*\\"]/g, "").trim();
}

// ── Real names ───────────────────────────────────────────────────────────────

export const NAME_VISIBILITY_OPTIONS = [
  { value: "hidden",        label: "Don't show my name" },
  { value: "first",         label: "First name only" },
  { value: "first_initial", label: "First name + last initial" },
  { value: "full",          label: "Full name" },
] as const;

export type NameVisibility = (typeof NAME_VISIBILITY_OPTIONS)[number]["value"];

export const NAME_VISIBILITY_VALUES = NAME_VISIBILITY_OPTIONS.map((o) => o.value) as readonly NameVisibility[];

export function isNameVisibility(v: unknown): v is NameVisibility {
  return typeof v === "string" && (NAME_VISIBILITY_VALUES as readonly string[]).includes(v);
}

/**
 * TypeScript mirror of the `profiles.display_name_public` generated column.
 *
 * The database is the authority — this exists so the settings form can show a
 * live "shown as" preview without a round trip. If you change one, change both;
 * `__tests__/lib/collectors.test.ts` pins the same cases the SQL was verified
 * against.
 */
export function formatDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  visibility: NameVisibility,
): string | null {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (visibility === "hidden" || !first) return null;
  if (visibility === "first") return first;
  if (visibility === "first_initial") {
    return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
  }
  if (visibility === "full") return last ? `${first} ${last}` : first;
  return null;
}

// ── Location ─────────────────────────────────────────────────────────────────

/**
 * Collapse a free-text city to a comparable form ("Boise, ID" → "boise id").
 *
 * This is the seam for real geo. Today `city` is untyped user text, so proximity
 * can only be string similarity; when a geocoded column lands, `sameArea` is the
 * one function that changes and the ranker is untouched.
 */
export function normalizeArea(area: string | null | undefined): string {
  return (area ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether two free-text locations plausibly describe the same place. Containment
 * either way, so "Boise" matches "Boise, ID" — but a token shorter than three
 * characters must match exactly, or a bare state code like "ID" would claim every
 * city in the state.
 */
export function sameArea(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeArea(a);
  const nb = normalizeArea(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (Math.min(na.length, nb.length) < 3) return false;
  return na.includes(nb) || nb.includes(na);
}

// ── Ranking ──────────────────────────────────────────────────────────────────

export type RankContext = {
  /** Collector ids the viewer follows *and* who follow the viewer back. */
  mutualIds?: ReadonlySet<string>;
  /** Collector ids with a follow edge in exactly one direction. */
  followIds?: ReadonlySet<string>;
  /** The viewer's own city, for the "near you" tier. */
  viewerArea?: string | null;
};

export type RankableCollector = {
  id?: string;
  username: string;
  display_name_public?: string | null;
  city?: string | null;
};

/**
 * Order search results.
 *
 * Relevance is the OUTER sort and the social graph is the tiebreak *within* a
 * relevance tier — deliberately, not the other way round. Ranking every mutual
 * follow above everything else would mean searching "goat" hands you your friend
 * "goatfarm" ahead of the actual @goat, which breaks the thing a search box is
 * primarily for: reaching one specific person you already have in mind.
 *
 * Relevance tiers: exact handle/name → prefix → substring → matched only on
 * city or specialty. Within a tier: mutual follow → one-way follow → city matches
 * the query → city matches the viewer's own city → alphabetical.
 */
export function rankCollectorMatches<T extends RankableCollector>(
  rows: T[],
  query: string,
  ctx: RankContext = {},
): T[] {
  const q = query.toLowerCase().trim();
  const { mutualIds, followIds, viewerArea } = ctx;

  // Best (lowest) relevance tier across the handle and the public name, so
  // someone who searches a real name gets the same precision as a handle search.
  const relevance = (row: T) => {
    const candidates = [row.username, row.display_name_public ?? ""]
      .map((s) => s.toLowerCase())
      .filter(Boolean);
    let best = 3;
    for (const c of candidates) {
      if (c === q) return 0;
      if (c.startsWith(q)) best = Math.min(best, 1);
      else if (c.includes(q)) best = Math.min(best, 2);
    }
    return best;
  };

  const affinity = (row: T) => {
    const id = row.id;
    if (id && mutualIds?.has(id)) return 0;
    if (id && followIds?.has(id)) return 1;
    if (sameArea(row.city, q)) return 2;
    if (viewerArea && sameArea(row.city, viewerArea)) return 3;
    return 4;
  };

  return [...rows].sort(
    (a, b) =>
      relevance(a) - relevance(b) ||
      affinity(a) - affinity(b) ||
      a.username.localeCompare(b.username),
  );
}
