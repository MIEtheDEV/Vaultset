import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";
import { AdminUserActions } from "@/components/AdminUserActions";

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  return new Date(bannedUntil) > new Date();
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const admin = createAdminClient();

  const [{ data: authData }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, username, avatar_url"),
  ]);

  const users = authData?.users ?? [];
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const filtered = q
    ? users.filter((u) => {
        const profile = profileMap.get(u.id);
        return (
          profile?.username?.toLowerCase().includes(q.toLowerCase()) ||
          u.email?.toLowerCase().includes(q.toLowerCase())
        );
      })
    : users;

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="shrink-0">
          <h2 className="text-xl font-semibold text-foreground">Users</h2>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {filtered.length} of {users.length} users
          </p>
        </div>
        <form className="flex items-center gap-2 sm:ml-auto" method="get">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search username or email…"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-gold/50 w-full sm:w-60 min-w-0"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-foreground hover:border-gold/30 transition-colors"
          >
            Search
          </button>
          {q && (
            <Link
              href="/admin/users"
              className="shrink-0 text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="divide-y divide-border rounded-2xl border border-border bg-surface overflow-hidden">
        {sorted.length === 0 ? (
          <p className="text-sm text-foreground-muted text-center py-10">No users found.</p>
        ) : sorted.map((user) => {
          const profile = profileMap.get(user.id);
          const banned = isBanned(user.banned_until);
          const initial = (profile?.username ?? user.email ?? "?")[0].toUpperCase();

          return (
            <div key={user.id} className="px-4 py-3 space-y-2 hover:bg-surface-raised/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs text-foreground-muted font-medium shrink-0">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="font-medium text-foreground hover:text-gold transition-colors text-sm truncate"
                    >
                      {profile?.username ? `@${profile.username}` : "—"}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                        banned
                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      }`}
                    >
                      {banned ? "Banned" : "Active"}
                    </span>
                  </div>
                  <p className="text-xs text-foreground-muted truncate">{user.email ?? "—"}</p>
                  <p className="text-xs text-foreground-muted/60">
                    Joined {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {user.last_sign_in_at && (
                      <> · Last seen {new Date(user.last_sign_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
                    )}
                  </p>
                </div>
              </div>
              <AdminUserActions
                userId={user.id}
                banned={banned}
                username={profile?.username ?? user.email ?? user.id}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
