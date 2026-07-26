import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  loadDailyChanges,
  computeVaultPulse,
  pulseChange,
  type VaultItem,
} from "@/lib/vaultDaily";

/**
 * The daily vault digest — the app's only self-initiated notification, and the
 * one thing that gives a user a reason to come back tomorrow.
 *
 * Everything this needs already existed and was going unused: pg_cron runs a
 * daily price snapshot, `price_history` has been accumulating for months, and
 * the whole web-push stack is wired end-to-end behind an AFTER INSERT trigger on
 * `notifications`. Nothing was scheduled to *use* any of it — every badge and
 * alert fired only when a user was already looking at the page.
 *
 * So this endpoint does not send push itself. It inserts a `daily_digest`
 * notification row per user and lets the existing `dispatch_push_notification()`
 * trigger fan it out, which means the digest inherits per-type preferences,
 * device pruning, and payload building for free.
 *
 * Invoked by the `daily-vault-digest` cron job at 13:00 UTC — see
 * supabase/phase6_engagement.sql. Secret-authed on the same shared secret as
 * /api/push/dispatch.
 */

/** Below this, a digest is noise rather than news. */
const MIN_MOVE_USD = 0.5;

/**
 * Hard ceiling on users processed per run. Each user costs ~3 queries, which is
 * comfortable at current scale but not something to let grow unbounded — if this
 * cap is ever hit the run logs it rather than silently truncating.
 */
const MAX_USERS = 500;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  const provided = req.headers.get("x-push-secret") ?? "";
  if (!secret || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Only users who could actually receive it. No push subscription means the
  // notification row would be an unread badge nobody asked for.
  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("user_id");

  if (subsError) {
    return NextResponse.json({ error: subsError.message }, { status: 500 });
  }

  const allUserIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  const truncated = allUserIds.length > MAX_USERS;
  const userIds = allUserIds.slice(0, MAX_USERS);

  if (truncated) {
    console.warn(
      `[digest] ${allUserIds.length} eligible users exceeds the ${MAX_USERS} cap — ` +
        `${allUserIds.length - MAX_USERS} skipped this run. Time to batch this job.`,
    );
  }

  // Opt-outs. Missing row = all on, matching the rest of the push stack.
  const { data: prefRows } = userIds.length
    ? await admin
        .from("notification_preferences")
        .select("user_id, push_digest")
        .in("user_id", userIds)
    : { data: [] as { user_id: string; push_digest: boolean }[] };

  const optedOut = new Set(
    (prefRows ?? [])
      .filter((p) => (p as { push_digest?: boolean }).push_digest === false)
      .map((p) => p.user_id as string),
  );

  let sent = 0;
  let skippedFlat = 0;
  let skippedEmpty = 0;
  const failures: string[] = [];

  for (const userId of userIds) {
    if (optedOut.has(userId)) continue;

    try {
      const { data: items } = await admin
        .from("collection_items")
        .select(
          "id, quantity, market_price, finish, condition, grader, cards ( id, name, set_name, card_number, image_url, game_data )",
        )
        .eq("user_id", userId);

      const vaultItems = (items ?? []) as unknown as VaultItem[];
      if (vaultItems.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      const changes = await loadDailyChanges(admin, userId, vaultItems);
      const pulse = computeVaultPulse(vaultItems, changes);
      const change = pulseChange(pulse);

      if (!change || Math.abs(change.abs) < MIN_MOVE_USD) {
        skippedFlat += 1;
        continue;
      }

      // The single most notable card, used to make the push body concrete
      // ("led by Charizard ex") rather than a bare number.
      const leader =
        change.abs >= 0 ? pulse.movers.up[0] ?? null : pulse.movers.down[0] ?? null;

      const { error } = await admin.from("notifications").insert({
        user_id: userId,
        type: "daily_digest",
        actor_id: null,
        data: {
          change_abs: Number(change.abs.toFixed(2)),
          change_pct: Number(change.pct.toFixed(2)),
          total_value: pulse.singlesValue,
          covered: pulse.covered,
          total: pulse.total,
          leader_name: leader?.name ?? null,
          leader_pct: leader ? Number(leader.change.pct.toFixed(1)) : null,
        },
      });

      if (error) {
        failures.push(`${userId}: ${error.message}`);
      } else {
        sent += 1;
      }
    } catch (e) {
      // One user's bad data must not abort the whole run.
      failures.push(`${userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (failures.length > 0) {
    console.warn(`[digest] ${failures.length} failure(s): ${failures.slice(0, 5).join("; ")}`);
  }

  return NextResponse.json({
    eligible: userIds.length,
    sent,
    skippedFlat,
    skippedEmpty,
    optedOut: optedOut.size,
    failed: failures.length,
    truncated,
  });
}
