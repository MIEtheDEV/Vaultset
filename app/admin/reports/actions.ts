"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin";

async function getAdminProfileId(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("username", process.env.ADMIN_USERNAME!)
    .single();
  if (!data) throw new Error("Admin profile not found.");
  return data.id as string;
}

async function getOrCreateThread(adminProfileId: string, targetUserId: string): Promise<string> {
  const admin = createAdminClient();
  const [p1, p2] = [adminProfileId, targetUserId].sort() as [string, string];

  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("participant_1", p1)
    .eq("participant_2", p2)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await admin
    .from("conversations")
    .insert({ participant_1: p1, participant_2: p2 })
    .select("id")
    .single();

  if (error || !created) throw new Error("Failed to create thread.");
  return created.id as string;
}

/**
 * Loads the authoritative target/offense/username for a report straight from
 * the DB. Admin actions must derive these from the report row rather than trust
 * client-supplied parameters — otherwise an admin call could act on an
 * arbitrary user (or inject arbitrary text into system messages) under cover of
 * an unrelated report.
 */
async function loadReportTarget(
  reportId: string,
): Promise<{ reportedUserId: string; reason: string; reportedUsername: string }> {
  const admin = createAdminClient();
  const { data: report } = await admin
    .from("reports")
    .select("reported_user_id, reason")
    .eq("id", reportId)
    .single();
  if (!report?.reported_user_id) throw new Error("Report not found.");

  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", report.reported_user_id)
    .single();

  return {
    reportedUserId:   report.reported_user_id as string,
    reason:           (report.reason as string) ?? "",
    reportedUsername: (profile?.username as string) ?? "user",
  };
}

function softBanDuration(
  oldCount: number,
  newCount: number,
): { duration: string; label: string } | null {
  const thresholds = [
    { at: 11, duration: "720h",  label: "30 days" },
    { at: 10, duration: "336h",  label: "14 days" },
    { at:  8, duration: "168h",  label: "7 days"  },
    { at:  5, duration:  "72h",  label: "3 days"  },
  ];
  for (const t of thresholds) {
    if (oldCount < t.at && newCount >= t.at) return t;
  }
  return null;
}

// ── Report status ────────────────────────────────────────────────────────────

export async function dismissReport(reportId: string, notes?: string) {
  const adminUser = await assertAdmin();
  const admin = createAdminClient();
  await Promise.all([
    admin.from("reports").update({ status: "dismissed", notes: notes || null }).eq("id", reportId),
    admin.from("admin_audit_log").insert({
      admin_id:  adminUser.id,
      report_id: reportId,
      action:    "dismiss_report",
      metadata:  notes ? { notes } : null,
    }),
  ]);
  revalidatePath("/admin/reports");
}

export async function resolveReport(reportId: string, notes?: string) {
  const adminUser = await assertAdmin();
  const admin = createAdminClient();
  await Promise.all([
    admin.from("reports").update({ status: "reviewed", notes: notes || null }).eq("id", reportId),
    admin.from("admin_audit_log").insert({
      admin_id:  adminUser.id,
      report_id: reportId,
      action:    "resolve_report",
      metadata:  notes ? { notes } : null,
    }),
  ]);
  revalidatePath("/admin/reports");
}

export async function reopenReport(reportId: string) {
  const adminUser = await assertAdmin();
  const admin = createAdminClient();
  await Promise.all([
    admin.from("reports").update({ status: "open", notes: null }).eq("id", reportId),
    admin.from("admin_audit_log").insert({
      admin_id:  adminUser.id,
      report_id: reportId,
      action:    "reopen_report",
    }),
  ]);
  revalidatePath("/admin/reports");
}

// ── Messaging ────────────────────────────────────────────────────────────────

export async function openAdminThread(targetUserId: string) {
  await assertAdmin();
  const adminProfileId = await getAdminProfileId();
  const convId = await getOrCreateThread(adminProfileId, targetUserId);
  revalidatePath("/messages");
  redirect(`/messages/${convId}`);
}

// ── Notify ───────────────────────────────────────────────────────────────────

export async function notifyUser(reportId: string) {
  const adminUser      = await assertAdmin();
  const adminProfileId = await getAdminProfileId();
  const admin          = createAdminClient();

  const { reportedUserId, reason, reportedUsername } = await loadReportTarget(reportId);

  const convId = await getOrCreateThread(adminProfileId, reportedUserId);

  const body =
    `Hi @${reportedUsername},\n\n` +
    `We received a report on your account for: "${reason}".\n\n` +
    `No official warning has been issued at this time — this event has been noted in our system. ` +
    `We encourage you to keep all interactions respectful and within our community guidelines.\n\n` +
    `If you believe this report was made in error, feel free to reply here.`;

  await Promise.all([
    admin.from("messages").insert({
      conversation_id: convId,
      sender_id: adminProfileId,
      body,
      is_system: true,
    }),
    admin.from("admin_audit_log").insert({
      admin_id:       adminUser.id,
      target_user_id: reportedUserId,
      report_id:      reportId,
      action:         "notify",
      offense_type:   reason,
    }),
    admin.from("reports").update({ status: "reviewed" }).eq("id", reportId),
  ]);

  revalidatePath("/admin/reports");
  revalidatePath("/messages");
  revalidatePath(`/messages/${convId}`);
}

// ── Warn ─────────────────────────────────────────────────────────────────────

export async function warnUser(reportId: string) {
  const adminUser      = await assertAdmin();
  const adminProfileId = await getAdminProfileId();
  const admin          = createAdminClient();

  const { reportedUserId, reason: offenseType, reportedUsername } = await loadReportTarget(reportId);

  // Read current counts server-side (don't trust client)
  const [{ count: typeCount }, { data: profileRow }] = await Promise.all([
    admin
      .from("user_warnings")
      .select("*", { count: "exact", head: true })
      .eq("user_id", reportedUserId)
      .eq("offense_type", offenseType),
    admin.from("profiles").select("cumulative_warnings").eq("id", reportedUserId).single(),
  ]);

  const warningNumber  = (typeCount ?? 0) + 1;
  const oldCumulative  = profileRow?.cumulative_warnings ?? 0;
  const newCumulative  = oldCumulative + 1;
  const softBan        = softBanDuration(oldCumulative, newCumulative);

  await Promise.all([
    admin.from("user_warnings").insert({
      user_id:        reportedUserId,
      offense_type:   offenseType,
      warning_number: warningNumber,
      report_id:      reportId,
      issued_by:      adminUser.id,
    }),
    admin.from("profiles")
      .update({ cumulative_warnings: newCumulative })
      .eq("id", reportedUserId),
  ]);

  if (softBan) {
    await Promise.all([
      admin.auth.admin.updateUserById(reportedUserId, { ban_duration: softBan.duration }),
      admin.from("profiles").update({ banned: true }).eq("id", reportedUserId),
      admin.from("admin_audit_log").insert({
        admin_id:       adminUser.id,
        target_user_id: reportedUserId,
        report_id:      reportId,
        action:         "soft_ban",
        offense_type:   offenseType,
        metadata:       { duration: softBan.duration, label: softBan.label, cumulative: newCumulative },
      }),
    ]);
  }

  const convId = await getOrCreateThread(adminProfileId, reportedUserId);

  let body =
    `Hi @${reportedUsername},\n\n` +
    `This is an official warning regarding your account.\n\n` +
    `Offense: ${offenseType}\n` +
    `Warning #${warningNumber} for this category.\n\n` +
    `Repeated violations may result in temporary or permanent account restrictions.`;

  if (softBan) {
    body += `\n\nDue to accumulated warnings your account has been temporarily restricted for ${softBan.label}. ` +
      `You may reply here if you'd like to discuss this.`;
  } else {
    body += `\n\nIf you have any questions, feel free to reply here.`;
  }

  await Promise.all([
    admin.from("messages").insert({
      conversation_id: convId,
      sender_id: adminProfileId,
      body,
      is_system: true,
    }),
    admin.from("admin_audit_log").insert({
      admin_id:       adminUser.id,
      target_user_id: reportedUserId,
      report_id:      reportId,
      action:         "warn",
      offense_type:   offenseType,
      metadata:       { warning_number: warningNumber, cumulative: newCumulative },
    }),
    admin.from("reports").update({ status: "reviewed" }).eq("id", reportId),
  ]);

  revalidatePath("/admin/reports");
  revalidatePath("/messages");
  revalidatePath(`/messages/${convId}`);
}

// ── Ban from report (after 3 per-type warnings) ──────────────────────────────

export async function banUserFromReport(reportId: string) {
  const adminUser = await assertAdmin();
  const admin     = createAdminClient();

  const { reportedUserId, reason: offenseType } = await loadReportTarget(reportId);

  await Promise.all([
    admin.auth.admin.updateUserById(reportedUserId, { ban_duration: "87600h" }),
    admin.from("profiles").update({ banned: true }).eq("id", reportedUserId),
    admin.from("admin_audit_log").insert({
      admin_id:       adminUser.id,
      target_user_id: reportedUserId,
      report_id:      reportId,
      action:         "ban",
      offense_type:   offenseType,
    }),
    admin.from("reports").update({ status: "reviewed" }).eq("id", reportId),
  ]);

  revalidatePath("/admin/reports");
  revalidatePath("/admin/users");
}
