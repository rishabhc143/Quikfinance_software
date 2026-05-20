import {
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  endOfDay,
} from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { toCsv, csvResponse, csvDateSuffix } from "@/lib/reports/csv-export";
import { toXlsx, xlsxResponse } from "@/lib/reports/xlsx-export";
import {
  buildTimesheetPdf,
  pdfResponse,
  type TimesheetPdfRow,
} from "@/lib/time/timesheet-pdf";

const DEFAULT_MAX_ROWS = 25_000;
const HARD_CAP = 25_000;
const PDF_MAX_ROWS = 1_000;

const VALID_SCOPES = new Set(["all", "my", "billable", "non-billable"]);
const VALID_PERIODS = new Set([
  "all",
  "today",
  "this-week",
  "this-month",
  "this-year",
]);

function rangeForPeriod(period: string): { gte?: Date; lte?: Date } {
  const now = new Date();
  switch (period) {
    case "today":
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case "this-week":
      return { gte: startOfWeek(now, { weekStartsOn: 1 }), lte: endOfDay(now) };
    case "this-month":
      return { gte: startOfMonth(now), lte: endOfDay(now) };
    case "this-year":
      return { gte: startOfYear(now), lte: endOfDay(now) };
    default:
      return {};
  }
}

/**
 * CSV / XLSX / PDF export of Timesheet entries. Honours the export
 * dialog config via URL params + the list page's filters
 * (period / customerId / projectId / userId / scope) so "Export
 * Current View" matches the on-screen table.
 *
 *   ?format=csv|xls|xlsx|pdf
 *   ?decimal=us|eu
 *   ?includePii=true|false   (when false, drops User + Notes)
 *   ?scope=all|my|billable|non-billable
 *   ?period=all|today|this-week|this-month|this-year
 *   ?customerId=…  ?projectId=…  ?userId=…
 *   ?maxRows=N      (clamped, PDF further clamped)
 */
export async function GET(req: Request) {
  const { user, organization } = await requireOrganization();
  const { searchParams } = new URL(req.url);

  const formatParam = (searchParams.get("format") ?? "csv").toLowerCase();
  const isPdf = formatParam === "pdf";
  const isXlsx = formatParam === "xlsx" || formatParam === "xls";

  const decimal = (searchParams.get("decimal") ?? "us").toLowerCase();
  const includePii = searchParams.get("includePii") === "true";

  const scope = VALID_SCOPES.has(searchParams.get("scope") ?? "")
    ? (searchParams.get("scope") as string)
    : "all";
  const period = VALID_PERIODS.has(searchParams.get("period") ?? "")
    ? (searchParams.get("period") as string)
    : "all";
  const customerId = (searchParams.get("customerId") ?? "").trim();
  const projectId = (searchParams.get("projectId") ?? "").trim();
  const userIdParam = (searchParams.get("userId") ?? "").trim();

  const requestedMaxRows = parseInt(searchParams.get("maxRows") ?? "", 10);
  let maxRows =
    Number.isFinite(requestedMaxRows) && requestedMaxRows > 0
      ? Math.min(requestedMaxRows, HARD_CAP)
      : DEFAULT_MAX_ROWS;
  if (isPdf) maxRows = Math.min(maxRows, PDF_MAX_ROWS);

  const dateRange = rangeForPeriod(period);
  const projectFilter: Prisma.ProjectWhereInput | undefined = customerId
    ? { customerId }
    : undefined;

  const where: Prisma.TimeEntryWhereInput = {
    organizationId: organization.id,
    ...(dateRange.gte ? { date: { gte: dateRange.gte, lte: dateRange.lte } } : {}),
    ...(projectId ? { projectId } : {}),
    ...(userIdParam ? { userId: userIdParam } : {}),
    ...(scope === "my" ? { userId: user.id } : {}),
    ...(scope === "billable" ? { billable: true } : {}),
    ...(scope === "non-billable" ? { billable: false } : {}),
    ...(projectFilter ? { project: projectFilter } : {}),
  };

  const rows = await db.timeEntry.findMany({
    where,
    orderBy: { date: "desc" },
    take: maxRows,
    include: {
      project: { select: { id: true, name: true } },
      task: { select: { id: true, name: true } },
    },
  });

  // Hydrate user names for PII-on exports
  const userIds = includePii
    ? Array.from(new Set(rows.map((r) => r.userId)))
    : [];
  const memberships =
    userIds.length > 0
      ? await db.organizationMembership.findMany({
          where: {
            organizationId: organization.id,
            userId: { in: userIds },
          },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
      : [];
  const userMap = new Map(
    memberships.map((m) => [
      m.user.id,
      m.user.name?.trim() || m.user.email.split("@")[0],
    ])
  );

  // ── Number formatting ──────────────────────────────────────────────
  const fmtHours = (n: number): string => {
    if (decimal === "eu") {
      return n.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return n.toFixed(2);
  };

  // ── CSV/XLSX data rows ─────────────────────────────────────────────
  const dataRows = rows.map((e) => {
    const base: Record<string, string | number | null | undefined> = {
      Date: format(e.date, "yyyy-MM-dd"),
      Project: e.project?.name ?? "",
      Task: e.task?.name ?? "",
      Hours: fmtHours(Number(e.hours)),
      Billable: e.billable === true ? "Yes" : e.billable === false ? "No" : "",
      Billed: e.isBilled ? "Billed" : "Unbilled",
    };
    if (includePii) {
      base["User"] = userMap.get(e.userId) ?? "";
      base["Notes"] = e.description ?? "";
    }
    return base;
  });

  const cols: string[] = ["Date", "Project", "Task"];
  if (includePii) cols.push("User", "Notes");
  cols.push("Hours", "Billable", "Billed");

  const suffix = csvDateSuffix(new Date());
  const baseName =
    scope === "all" && period === "all" && !customerId && !projectId && !userIdParam
      ? `timesheet-${suffix}`
      : `timesheet-filtered-${suffix}`;

  // ── PDF branch ─────────────────────────────────────────────────────
  if (isPdf) {
    const totalHours = rows.reduce((s, r) => s + Number(r.hours), 0);
    const billableHours = rows
      .filter((r) => r.billable !== false)
      .reduce((s, r) => s + Number(r.hours), 0);
    const unbilledHours = rows
      .filter((r) => !r.isBilled)
      .reduce((s, r) => s + Number(r.hours), 0);

    const pdfRows: TimesheetPdfRow[] = rows.map((e) => ({
      date: format(e.date, "dd MMM yyyy"),
      project: e.project?.name ?? "—",
      task: e.task?.name ?? "—",
      user: includePii ? userMap.get(e.userId) ?? "" : "",
      notes: includePii ? e.description ?? "" : "",
      hours: fmtHours(Number(e.hours)),
      billable: e.billable !== false,
      billed: e.isBilled,
    }));

    const scopeLabel =
      scope === "all"
        ? "All Timesheets"
        : scope === "my"
          ? "My Timesheets"
          : scope === "billable"
            ? "Billable"
            : "Non-billable";
    const metaLine = `Generated on ${format(new Date(), "dd MMM yyyy")} • ${scopeLabel} • Period: ${period}`;

    const buf = await buildTimesheetPdf({
      rows: pdfRows,
      includePii,
      metaLine,
      summary: {
        totalEntries: rows.length,
        totalHours: `${fmtHours(totalHours)} h`,
        billableHours: `${fmtHours(billableHours)} h`,
        unbilledHours: `${fmtHours(unbilledHours)} h`,
      },
    });
    return pdfResponse(baseName, buf);
  }

  // ── XLSX branch ────────────────────────────────────────────────────
  if (isXlsx) {
    const buf = await toXlsx({
      sheetName: "Timesheet",
      columns: cols.map((c) => ({
        key: c,
        header: c,
        width: c === "Notes" ? 40 : c === "Project" || c === "Task" ? 24 : 14,
      })),
      rows: dataRows,
    });
    return xlsxResponse(baseName, buf);
  }

  // ── CSV branch (default) ───────────────────────────────────────────
  const csv = toCsv(dataRows, cols);
  return csvResponse(baseName, csv);
}
