import Link from "next/link";
import { AVATAR_COLORS, isHexColor, resolveAvatarColor } from "@/lib/avatarColors";
import { isProSubscriber } from "@/lib/proStatus";
import { timeAgo } from "@/lib/timeAgo";
import { ProBadge } from "@/components/ProBadge";
import { SupporterBadge } from "@/components/SupporterBadge";
import type { CollectorSummary } from "@/lib/collectors";

// Presentational only — no hooks, no server-only imports — so this renders from
// both the server tree (the community page) and the client tree (search results).

export function CollectorAvatar({
  username,
  avatarUrl,
  avatarColor,
  size = 40,
}: {
  username: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  size?: number;
}) {
  const initial = (username || "?").charAt(0).toUpperCase();
  const customHex = avatarColor && isHexColor(avatarColor) ? avatarColor : null;
  const preset = customHex ? null : AVATAR_COLORS[resolveAvatarColor(avatarColor ?? null, username)];
  const box = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={username}
        style={box}
        className="shrink-0 rounded-full border border-border object-cover"
      />
    );
  }

  if (customHex) {
    return (
      <div
        style={{ ...box, background: customHex + "22", borderColor: customHex + "66", color: customHex }}
        className="flex shrink-0 select-none items-center justify-center rounded-full border font-bold"
      >
        {initial}
      </div>
    );
  }

  return (
    <div
      style={box}
      className={`flex shrink-0 select-none items-center justify-center rounded-full border font-bold ${preset!.bg} ${preset!.border} ${preset!.text}`}
    >
      {initial}
    </div>
  );
}

/**
 * A collector's profile card. The whole card is one link to `/profile/<username>`
 * — anywhere we show a username plus stats, the whole thing should be tappable,
 * not just the name.
 */
export function CollectorCard({
  collector,
  note,
}: {
  collector: CollectorSummary;
  /** Optional line under the username, e.g. "Joined 2d ago" on the welcome row. */
  note?: string;
}) {
  const { username, followers, cards, listings, city, specialty } = collector;
  const stats = [
    `${followers} follower${followers !== 1 ? "s" : ""}`,
    cards > 0 ? `${cards} card${cards !== 1 ? "s" : ""}` : null,
    listings > 0 ? `${listings} listing${listings !== 1 ? "s" : ""}` : null,
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/profile/${username}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-gold/40 hover:bg-surface-raised"
    >
      <CollectorAvatar
        username={username}
        avatarUrl={collector.avatar_url}
        avatarColor={collector.avatar_color}
        size={40}
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">@{username}</span>
          {collector.display_name && (
            <span className="min-w-0 truncate text-xs text-foreground-muted">{collector.display_name}</span>
          )}
          {isProSubscriber(collector) && <span className="shrink-0"><ProBadge /></span>}
          {collector.is_supporter && <span className="shrink-0"><SupporterBadge /></span>}
        </div>

        {specialty && (
          <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-400">
            {specialty}
          </span>
        )}

        <p className="truncate text-xs text-foreground-muted">
          {note ?? `Joined ${timeAgo(collector.created_at)}`}
          {city ? ` · ${city}` : ""}
        </p>
        <p className="truncate text-xs text-foreground-muted">{stats.join(" · ")}</p>
      </div>

      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-foreground-muted"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}
