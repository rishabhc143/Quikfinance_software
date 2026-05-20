import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { toCsv, csvResponse, csvDateSuffix } from "@/lib/reports/csv-export";
import { toXlsx, xlsxResponse } from "@/lib/reports/xlsx-export";
import { currencySymbol } from "@/lib/money";
import { buildProjectsPdf, pdfResponse } from "@/lib/time/projects-pdf";
import type { ProjectsPdfRow } from "@/lib/time/projects-pdf";
import { billingMethodLabel } from "../constants";

const DEFAULT_MAX_ROWS = 25_000;
const HARD_CAP = 25_000; // never exceed this regardless of ?maxRows

// PDFs render slower + browsers stream less efficiently; cap them lower.
const PDF_MAX_ROWS = 1_000;

/**
 * CSV / XLSX / PDF export of Projects. Honours the Export dialog's
 * configuration via URL params + the list page's `status`/`q` filters
 * so "Export Current View" produces a file matching what's on screen.
 *
 * Query params:
 *   ?format=csv|xls|xlsx|pdf  (default csv; xls falls back to xlsx)
 *   ?decimal=us|eu            (us = 1234567.89 / eu = 1234567,89)
 *   ?includePii=true|false    (default false; when false, drops customer
 *                              name + description columns)
 *   ?status=active|...        (list page filter forwarded)
 *   ?q=<text>                 (list page filter forwarded)
 *   ?maxRows=N                (clamped to HARD_CAP; PDF further clamped)
 */
export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const status = (searchParams.get("status") ?? "all").toLowerCase();
  const VALID = new Set(["active", "inactive", "completed", "cancelled"]);

  const formatParam = (searchParams.get("format") ?? "csv").toLowerCase();
  const isPdf = formatParam === "pdf";
  // XLS (legacy 97-2004) is served as XLSX for v1 — Excel opens both.
  const isXlsx = formatParam === "xlsx" || formatParam === "xls";

  const decimal = (searchParams.get("decimal") ?? "us").toLowerCase();
  const includePii = searchParams.get("includePii") === "true";

  // Row cap — dialogs can request 10k (current view) or 25k (full export).
  // PDFs additionally clamp to PDF_MAX_ROWS for render perf.
  const requestedMaxRows = parseInt(searchParams.get("maxRows") ?? "", 10);
  let maxRows =
    Number.isFinite(requestedMaxRows) && requestedMaxRows > 0
      ? Math.min(requestedMaxRows, HARD_CAP)
      : DEFAULT_MAX_ROWS;
  if (isPdf) maxRows = Math.min(maxRows, PDF_MAX_ROWS);

  const where: Prisma.ProjectWhereInput = {
    organizationId: organization.id,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(VALID.has(status) ? { status } : {}),
  };

  const rows = await db.project.findMany({
    where,
    orderBy: { name: "asc" },
    take: maxRows,
  });

  // Hydrate customer names only if we'll emit them.
  const customerIds = includePii
    ? Array.from(new Set(rows.map((r) => r.customerId).filter(Boolean) as string[]))
    : [];
  const customers =
    customerIds.length > 0
      ? await db.contact.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, displayName: true },
        })
      : [];
  const customerMap = new Map(customers.map((c) => [c.id, c.displayName]));

  // ── Number formatting helpers ────────────────────────────────────────
  const symbol = currencySymbol(organization.currency);

  const fmtNum = (n: number | null): string => {
    if (n === null || n === undefined) return "";
    if (decimal === "eu") {
      return n.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const fmtMoney = (n: number | null): string => {
    if (n === null || n === undefined) return "";
    return `${symbol}${fmtNum(n)}`;
  };

  // ── Common data layer ────────────────────────────────────────────────
  const dataRows = rows.map((p) => {
    const base: Record<string, string | number | null | undefined> = {
      "Project Name": p.name,
      "Project Code": p.projectCode ?? "",
      "Status": p.status,
      "Billing Method": billingMethodLabel(p.billingMethod),
      "Cost Budget": p.budget ? fmtNum(Number(p.budget)) : "",
      "Revenue Budget": p.revenueBudget ? fmtNum(Number(p.revenueBudget)) : "",
      "Start Date": p.startDate ? format(p.startDate, "yyyy-MM-dd") : "",
      "End Date": p.endDate ? format(p.endDate, "yyyy-MM-dd") : "",
      "Created At": format(p.createdAt, "yyyy-MM-dd"),
    };
    if (includePii) {
      base["Customer Name"] = p.customerId ? customerMap.get(p.customerId) ?? "" : "";
      base["Description"] = p.description ?? "";
    }
    return base;
  });

  const cols: string[] = ["Project Name", "Project Code"];
  if (includePii) cols.push("Customer Name");
  cols.push("Status", "Billing Method");
  if (includePii) cols.push("Description");
  cols.push("Cost Budget", "Revenue Budget", "Start Date", "End Date", "Created At");

  const suffix = csvDateSuffix(new Date());
  const baseName =
    status === "all" && !q
      ? `projects-${suffix}`
      : `projects-${status === "all" ? "filtered" : status}-${suffix}`;

  // ── PDF branch ───────────────────────────────────────────────────────
  if (isPdf) {
    const totalCost = rows.reduce(
      (s, p) => s + (p.budget ? Number(p.budget) : 0),
      0
    );
    const totalRevenue = rows.reduce(
      (s, p) => s + (p.revenueBudget ? Number(p.revenueBudget) : 0),
      0
    );
    const activeCount = rows.filter((p) => p.status === "active").length;

    const pdfRows: ProjectsPdfRow[] = rows.map((p) => ({
      name: p.name,
      code: p.projectCode ?? "",
      customer: includePii
        ? p.customerId
          ? customerMap.get(p.customerId) ?? ""
          : ""
        : "",
      status: p.status,
      billingMethod: billingMethodLabel(p.billingMethod) || "",
      description: includePii ? p.description ?? "" : "",
      costBudget: p.budget ? fmtMoney(Number(p.budget)) : "—",
      revenueBudget: p.revenueBudget ? fmtMoney(Number(p.revenueBudget)) : "—",
      startDate: p.startDate ? format(p.startDate, "dd MMM yyyy") : "—",
      endDate: p.endDate ? format(p.endDate, "dd MMM yyyy") : "—",
    }));

    const scopeLabel =
      status === "all" ? "All Projects" : `${statusLabel(status)} Projects`;
    const metaLine = `Generated on ${format(new Date(), "dd MMM yyyy")} • ${scopeLabel} • ${organization.currency}`;

    const buf = await buildProjectsPdf({
      rows: pdfRows,
      includePii,
      metaLine,
      summary: {
        totalProjects: rows.length,
        activeProjects: activeCount,
        totalCostBudget: fmtMoney(totalCost),
        totalRevenueBudget: fmtMoney(totalRevenue),
      },
    });
    return pdfResponse(baseName, buf);
  }

  // ── XLSX branch ──────────────────────────────────────────────────────
  if (isXlsx) {
    const buf = await toXlsx({
      sheetName: "Projects",
      columns: cols.map((c) => ({
        key: c,
        header: c,
        // Width hints for the wider text columns.
        width: c === "Description" ? 40 : c === "Billing Method" ? 24 : 18,
      })),
      rows: dataRows,
    });
    return xlsxResponse(baseName, buf);
  }

  // ── CSV branch (default) ─────────────────────────────────────────────
  const csv = toCsv(dataRows, cols);
  return csvResponse(baseName, csv);
}

function statusLabel(s: string) {
  return s
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
