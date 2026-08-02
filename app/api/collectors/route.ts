import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  COLLECTOR_COLUMNS,
  fetchCollectorCounts,
  rankCollectorMatches,
  sanitizeCollectorQuery,
  toCollectorSummary,
  type CollectorProfileRow,
  type RankContext,
} from "@/lib/collectors";

const MAX_RESULTS = 24;

// Results are identical for every signed-out caller, so they can sit in the
// shared edge cache. A signed-in caller's results are ORDERED BY WHO THEY FOLLOW —
// caching those publicly would hand one user's social graph to the next visitor,
// so personalized responses must never be shared.
const PUBLIC_CACHE = "public, s-maxage=60, stale-while-revalidate=300";
const PRIVATE_CACHE = "private, no-store";

/**
 * Collector search for the community page. Matches on username, public display
 * name, city, and specialty so "chicago", "vintage", or a real name all find
 * people, not just an exact handle.
 *
 * Name matching hits `display_name_public` only — the generated column. A user
 * who shows "Alex M." is findable as "Alex" or "Alex M", and searching their
 * actual surname will not surface them, so the visibility setting is a real
 * promise rather than a display filter.
 *
 * The profile read uses the service role because the caller may be signed out
 * (the community page is public/ISR); every column returned is one `profiles`
 * already grants to `anon`.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const term = sanitizeCollectorQuery(raw);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cache = user ? PRIVATE_CACHE : PUBLIC_CACHE;

  if (term.length < 2) {
    return NextResponse.json({ collectors: [] }, { headers: { "Cache-Control": cache } });
  }

  const admin = createAdminClient();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select(COLLECTOR_COLUMNS)
    .eq("banned", false)
    // Values are double-quoted so a term containing `,` `(` `)` `.` (a pasted
    // city like "Boise, ID") stays one value instead of splitting the filter.
    // `sanitizeCollectorQuery` has already removed the only two characters that
    // could escape the quotes.
    .or(
      `username.ilike."%${term}%",display_name_public.ilike."%${term}%",city.ilike."%${term}%",specialty.ilike."%${term}%"`,
    )
    .order("username")
    .limit(MAX_RESULTS);

  if (error) {
    console.warn("[collectors] search failed:", error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const rows = (profiles ?? []) as CollectorProfileRow[];
  if (rows.length === 0) {
    return NextResponse.json({ collectors: [] }, { headers: { "Cache-Control": cache } });
  }

  const ids = rows.map((p) => p.id);
  const [counts, ranking] = await Promise.all([
    fetchCollectorCounts(admin, ids),
    buildRankContext(admin, user?.id ?? null, ids),
  ]);

  const collectors = rankCollectorMatches(rows, term, ranking).map((p) =>
    toCollectorSummary(p, counts.get(p.id)),
  );

  return NextResponse.json({ collectors }, { headers: { "Cache-Control": cache } });
}

/**
 * The viewer's follow edges with the matched collectors, plus their own city.
 * Empty for signed-out callers, which collapses ranking to pure relevance.
 *
 * Read with the service role and pinned to the caller's own id — the edges are
 * only ever used to reorder that caller's results, and are never returned.
 */
async function buildRankContext(
  admin: ReturnType<typeof createAdminClient>,
  viewerId: string | null,
  ids: string[],
): Promise<RankContext> {
  if (!viewerId || ids.length === 0) return {};

  const [{ data: iFollow }, { data: followMe }, { data: me }] = await Promise.all([
    admin.from("follows").select("following_id").eq("follower_id", viewerId).in("following_id", ids),
    admin.from("follows").select("follower_id").eq("following_id", viewerId).in("follower_id", ids),
    admin.from("profiles").select("city").eq("id", viewerId).maybeSingle(),
  ]);

  const outbound = new Set((iFollow ?? []).map((f) => f.following_id as string));
  const inbound = new Set((followMe ?? []).map((f) => f.follower_id as string));

  const mutualIds = new Set<string>();
  const followIds = new Set<string>();
  for (const id of new Set([...outbound, ...inbound])) {
    if (outbound.has(id) && inbound.has(id)) mutualIds.add(id);
    else followIds.add(id);
  }

  return { mutualIds, followIds, viewerArea: (me?.city as string | null) ?? null };
}
