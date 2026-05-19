/**
 * REPORTS — Per-report activity audit log.
 *
 * Powers the "Report Activity" drawer on every report page. Each
 * action a user takes on a report (export, customize, schedule) is
 * recorded as one row in the `ReportActivity` table, keyed by
 * `(organizationId, reportKey)` so the drawer's "last N events for
 * this report" query is a single index seek.
 *
 * eventType is a string union (not a Prisma enum) so adding new
 * event kinds in future PRs (Phase B's Schedule actions, Phase A1.5's
 * Save as Custom Report) does not require another migration. The
 * runtime validates the string against the union at write time.
 */

import { db } from "@/lib/db";
import { findReport } from "@/lib/reports/catalog";

export type ReportActivityEventType =
  | "EXPORT_PDF"
  | "EXPORT_XLSX"
  | "EXPORT_CSV"
  | "PRINTED"
  | "CUSTOMIZED"
  // Phase B (Schedule + Email) — accepted now so Phase A's
  // formatter has the matching cases; no writers yet.
  | "SCHEDULE_CREATED"
  | "SCHEDULE_UPDATED"
  | "SCHEDULE_PAUSED"
  | "SCHEDULE_RESUMED"
  | "SCHEDULE_DELETED"
  | "SCHEDULE_SENT";

export type ReportActivityEventData =
  | { format: "PDF" | "XLSX" | "CSV"; filename: string }
  | { recipients: string[]; frequency?: string }
  | { customizations: Record<string, unknown> }
  | Record<string, unknown>;

export type ReportActivityRow = {
  id: string;
  organizationId: string;
  userId: string;
  userDisplayName: string;
  reportKey: string;
  eventType: ReportActivityEventType;
  eventData: ReportActivityEventData | null;
  createdAt: Date;
};

/**
 * Insert one activity row. Caller is responsible for org membership
 * checks — this is a leaf write helper, not a guarded surface.
 *
 * Returns the inserted row id. Errors are NOT thrown back; if the
 * write fails we log + swallow so a hiccup in the audit table never
 * breaks the user-facing action (export download, etc.).
 */
export async function logReportActivity(args: {
  organizationId: string;
  userId: string;
  reportKey: string;
  eventType: ReportActivityEventType;
  eventData?: ReportActivityEventData | null;
}): Promise<string | null> {
  try {
    const row = await db.reportActivity.create({
      data: {
        organizationId: args.organizationId,
        userId: args.userId,
        reportKey: args.reportKey,
        eventType: args.eventType,
        eventData: (args.eventData ?? undefined) as never,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // Fail-open. Audit log is best-effort.
    console.error("[reports/activity] logReportActivity failed", err);
    return null;
  }
}

/**
 * Fetch the most-recent activity rows for one (org, report). Joined
 * to User so the drawer can show a display name without a follow-up
 * query.
 *
 * **Fail-open**: wraps the Prisma calls in try/catch. If the
 * `ReportActivity` table doesn't exist yet (migration hasn't been
 * applied) or any other DB error, returns `[]` so the report page
 * still renders with an empty Activity drawer. Without this guard,
 * a missing-table error would crash the entire report page.
 */
export async function getRecentReportActivity(
  organizationId: string,
  reportKey: string,
  limit = 20
): Promise<ReportActivityRow[]> {
  try {
    const rows = await db.reportActivity.findMany({
      where: { organizationId, reportKey },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    if (rows.length === 0) return [];

    // Join to User in a single follow-up; keeps the main query
    // independent of any cross-schema Prisma relation on ReportActivity.
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return rows.map((r) => {
      const u = byId.get(r.userId);
      const displayName =
        u?.name?.trim() ||
        // Fall back to local-part of email if no name (matches the reference's
        // screenshot which shows "purvansh.bhor").
        (u?.email ? u.email.split("@")[0] : "Unknown user");
      return {
        id: r.id,
        organizationId: r.organizationId,
        userId: r.userId,
        userDisplayName: displayName,
        reportKey: r.reportKey,
        eventType: r.eventType as ReportActivityEventType,
        eventData: (r.eventData ?? null) as ReportActivityEventData | null,
        createdAt: r.createdAt,
      };
    });
  } catch (err) {
    // Most likely the ReportActivity migration hasn't been applied
    // yet on this environment. Don't crash the report page — return
    // empty timeline and let the user keep using everything else.
    console.error(
      "[reports/activity] getRecentReportActivity failed (returning empty)",
      err
    );
    return [];
  }
}

/**
 * Human-readable message for one activity row, matching the tone
 * of the Report Activity drawer (see screenshot in PR description):
 *
 *   "PDF generated for the "Cash Flow Statement" report."
 *   "Schedule Created with recipients foo@bar.com, baz@qux.com"
 *
 * Falls back to a generic message if the reportKey isn't in the
 * catalog (defensive — shouldn't happen in practice).
 */
export function formatReportActivityMessage(
  event: Pick<ReportActivityRow, "eventType" | "eventData" | "reportKey">
): string {
  const catalogEntry = findReport(event.reportKey);
  const reportName = catalogEntry?.name ?? event.reportKey;
  const quoted = `"${reportName}"`;

  switch (event.eventType) {
    case "EXPORT_PDF":
      return `PDF generated for the ${quoted} report.`;
    case "EXPORT_XLSX":
      return `XLSX exported for the ${quoted} report.`;
    case "EXPORT_CSV":
      return `CSV exported for the ${quoted} report.`;
    case "PRINTED":
      return `${quoted} report sent to printer.`;
    case "CUSTOMIZED":
      return `${quoted} report customized.`;
    case "SCHEDULE_CREATED": {
      const recipients =
        (event.eventData as { recipients?: string[] } | null)?.recipients ?? [];
      const list = recipients.length
        ? recipients.join(", ")
        : "no recipients";
      return `Schedule Created with recipients ${list}`;
    }
    case "SCHEDULE_UPDATED":
      return `Schedule updated for the ${quoted} report.`;
    case "SCHEDULE_PAUSED":
      return `Schedule paused for the ${quoted} report.`;
    case "SCHEDULE_RESUMED":
      return `Schedule resumed for the ${quoted} report.`;
    case "SCHEDULE_DELETED":
      return `Schedule deleted for the ${quoted} report.`;
    case "SCHEDULE_SENT": {
      const recipients =
        (event.eventData as { recipients?: string[] } | null)?.recipients ?? [];
      return recipients.length
        ? `Report sent to ${recipients.join(", ")}.`
        : `Scheduled report sent.`;
    }
    default:
      return `Activity on ${quoted} report.`;
  }
}

/** Maps an event type to a lucide-icon name (string), so the drawer
 *  client component can do the actual import. Keeping this in the
 *  pure lib lets the server component pre-compute the icon name. */
export function iconNameForEvent(eventType: ReportActivityEventType): string {
  switch (eventType) {
    case "EXPORT_PDF":
      return "FileText";
    case "EXPORT_XLSX":
      return "FileSpreadsheet";
    case "EXPORT_CSV":
      return "FileType";
    case "PRINTED":
      return "Printer";
    case "CUSTOMIZED":
      return "SlidersHorizontal";
    case "SCHEDULE_CREATED":
    case "SCHEDULE_RESUMED":
      return "CalendarPlus";
    case "SCHEDULE_UPDATED":
      return "CalendarClock";
    case "SCHEDULE_PAUSED":
      return "PauseCircle";
    case "SCHEDULE_DELETED":
      return "CalendarX";
    case "SCHEDULE_SENT":
      return "Send";
    default:
      return "Circle";
  }
}
