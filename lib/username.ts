/**
 * Escape PostgREST/SQL LIKE wildcards (`\`, `%`, `_`) so a `.ilike()` filter
 * performs a case-INSENSITIVE EXACT match rather than a pattern match.
 *
 * Usernames may legitimately contain `_` (allowed charset is `[a-z0-9_]`), and
 * `_` is a single-character LIKE wildcard — so an unescaped
 * `.ilike("username", name)` would match unintended rows (e.g. `a_b` matching
 * `axb`). Use this for every username lookup so casing never bounces a real
 * profile and uniqueness checks stay collision-proof.
 */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
