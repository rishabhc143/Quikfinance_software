"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  computeInitialNextSendAt,
  isScheduleFormat,
  isScheduleFrequency,
  parseRecipients,
  recipientsToDb,
  type ScheduleFrequency,
} from "@/lib/reports/scheduled";
import { logReportActivity } from "@/lib/reports/activity";

/**
 * REPORTS — Server actions for the Schedule Report drawer.
 *
 * One pattern: every action validates input, calls
 * requireOrganization() so unauthed callers redirect, and
 * scopes every DB read/write to the active org. Activity events
 * are logged via logReportActivity (fail-open).
 */

export type CreateScheduleInput = {
  reportKey: string;
  reportTitle: string;
  frequency: string;
  format: string;
  startDate: string; // ISO yyyy-MM-ddTHH:mm
  recipients: string; // free-form text from the form
};

export async function createScheduledReportAction(
  input: CreateScheduleInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { organization, user } = await requireOrganization();

  if (!isScheduleFrequency(input.frequency)) {
    return { ok: false, error: "Invalid frequency" };
  }
  if (!isScheduleFormat(input.format)) {
    return { ok: false, error: "Invalid format" };
  }

  const parsed = parseRecipients(input.recipients);
  if (parsed.valid.length === 0) {
    return {
      ok: false,
      error: `No valid recipient emails${parsed.invalid.length ? ` (invalid: ${parsed.invalid.join(", ")})` : ""}`,
    };
  }

  const start = parseStartDate(input.startDate);
  if (!start) return { ok: false, error: "Invalid start date" };

  const now = new Date();
  const nextSendAt = computeInitialNextSendAt(
    start,
    input.frequency as ScheduleFrequency,
    now
  );

  const row = await db.scheduledReport.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      reportKey: input.reportKey,
      reportTitle: input.reportTitle,
      frequency: input.frequency,
      format: input.format,
      status: "ACTIVE",
      startDate: start,
      nextSendAt,
      recipients: recipientsToDb(parsed.valid),
    },
  });

  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: input.reportKey,
    eventType: "SCHEDULE_CREATED",
    eventData: {
      recipients: parsed.valid,
      frequency: input.frequency,
    },
  });

  revalidatePath(`/reports/${slugForReportKey(input.reportKey)}`);
  return { ok: true, id: row.id };
}

export async function pauseScheduledReportAction(id: string) {
  const { organization, user } = await requireOrganization();
  const row = await db.scheduledReport.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!row) return { ok: false, error: "Not found" };

  await db.scheduledReport.update({
    where: { id },
    data: { status: "PAUSED" },
  });
  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: row.reportKey,
    eventType: "SCHEDULE_PAUSED",
  });
  revalidatePath(`/reports/${slugForReportKey(row.reportKey)}`);
  return { ok: true };
}

export async function resumeScheduledReportAction(id: string) {
  const { organization, user } = await requireOrganization();
  const row = await db.scheduledReport.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!row) return { ok: false, error: "Not found" };

  await db.scheduledReport.update({
    where: { id },
    data: { status: "ACTIVE" },
  });
  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: row.reportKey,
    eventType: "SCHEDULE_RESUMED",
  });
  revalidatePath(`/reports/${slugForReportKey(row.reportKey)}`);
  return { ok: true };
}

export async function deleteScheduledReportAction(id: string) {
  const { organization, user } = await requireOrganization();
  const row = await db.scheduledReport.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!row) return { ok: false, error: "Not found" };

  await db.scheduledReport.delete({ where: { id } });
  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: row.reportKey,
    eventType: "SCHEDULE_DELETED",
  });
  revalidatePath(`/reports/${slugForReportKey(row.reportKey)}`);
  return { ok: true };
}

function parseStartDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function slugForReportKey(reportKey: string): string {
  switch (reportKey) {
    case "profit-and-loss":
      return "profit-loss";
    case "balance-sheet":
      return "balance-sheet";
    case "cash-flow-statement":
      return "cash-flow";
    default:
      return reportKey;
  }
}
