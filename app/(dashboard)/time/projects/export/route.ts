import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { toCsv, csvResponse, csvDateSuffix } from "@/lib/reports/csv-export";
import { toXlsx, xlsxResponse } from "@/lib/reports/xlsx-export";
import { billingMethodLabel } from "../constants";

const DEFAULT_MAX_ROWS = 25_000;
const HARD_CAP = 25_000; // never exceed this regardless of ?maxRows

/**
 * CSV / XLSX export of Projects. Honours the Export Projects dialog's
 * configuration via URL params + the list page's `status`/`q` filters
 * so "Export Current View" produces a file matching what's on screen.
 *
 * Query params:
 *   ?format=csv|xls|xlsx      (default csv; xls falls back to xlsx)
 *   ?decimal=us|eu            (us = 1234567.89 / eu = 1234567,89)
 *   ?includePii=true|false    (default false; when false, drops customer
 *                              name + description columns)
 *   ?status=active|...        (list page filter forwarded)
 *   ?q=<text>                 (list page filter forwarded)
 */
export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const status = (searchParams.get("status") ?? "all").toLowerCase();
  const VALID = new Set(["active", "inactive", "completed", "cancelled"]);

  const formatParam = (searchParams.get("format") ?? "csv").toLowerCase();
  // XLS (legacy 97-2004) is served as XLSX for v1 — Excel opens both.
  const isXlsx = formatParam === "xlsx" || formatParam === "xls";

  const decimal = (searchParams.get("decimal") ?? "us").toLowerCase();
  const includePii = searchParams.get("includePii") === "true";

  // Row cap — dialogs can request 10k (current view) or 25k (full export).
  // Clamp to HARD_CAP regardless of what they ask for.
  const requestedMaxRows = parseInt(searchParams.get("maxRows") ?? "", 10);
  const maxRows =
    Number.isFinite(requestedMaxRows) && requestedMaxRows > 0
      ? Math.min(requestedMaxRows, HARD_CAP)
      : DEFAULT_MAX_ROWS;

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

  const fmtNum = (n: number | null): string => {
    if (n === null || n === undefined) return "";
    if (decimal === "eu") {
      return n
        .toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
        .replace(/\./g, ""); // de-DE uses dot as thousands sep; strip for clean CSV
    }
    return n.toFixed(2);
  };

  const dataRows = rows.map((p) => {
    const base: Record<string, string | number | null | undefined> = {
      "Project Name": p.name,
      "Project Code": p.projectCode ?? "",
      "Status": p.status,
      "Billing Method": billingMethodLabel(p.billingMethod),
      "Cost Budget": fmtNum(p.budget ? Number(p.budget) : null),
      "Revenue Budget": fmtNum(p.revenueBudget ? Number(p.revenueBudget) : null),
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

  const csv = toCsv(dataRows, cols);
  return csvResponse(baseName, csv);
}
