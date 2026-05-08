import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M27: format a numeric string per the user-selected decimal style.
 *   "us"  -> 1234567.89  (default; raw)
 *   "en"  -> 1,234,567.89
 *   "eu"  -> 1.234.567,89
 */
function formatDecimal(raw: string | number, style: "us" | "en" | "eu"): string {
  if (style === "us") return String(raw);
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  if (style === "en") {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(n);
  }
  // EU: dot thousands, comma decimal
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const sp = req.nextUrl.searchParams;
  const rawMode = sp.get("mode");
  const mode =
    rawMode === "selected"
      ? "selected"
      : rawMode === "current_view"
      ? "current_view"
      : "all";
  const q = sp.get("q")?.trim() ?? "";
  const idsParam = sp.get("ids") ?? "";
  const ids =
    mode === "selected"
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1000)
      : [];
  const cap = mode === "all" ? 25_000 : mode === "current_view" ? 10_000 : 1_000;

  // M17f: Invoice export modal adds Status + Date Range filters per
  // Invoices Refinement Patch. Both apply across all three modes.
  const status = sp.get("status")?.trim();
  const fromDate = sp.get("from")?.trim();
  const toDate = sp.get("to")?.trim();
  type InvStatus =
    | "DRAFT"
    | "SENT"
    | "PARTIALLY_PAID"
    | "PAID"
    | "OVERDUE"
    | "VOID"
    | "WRITTEN_OFF";
  const statusFilter =
    status && status !== "all"
      ? status === "unpaid"
        ? {
            status: {
              in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] as InvStatus[],
            },
          }
        : { status: status as InvStatus }
      : {};
  const dateFilter: { issueDate?: { gte?: Date; lte?: Date } } = {};
  if (fromDate) dateFilter.issueDate = { gte: new Date(fromDate) };
  if (toDate)
    dateFilter.issueDate = {
      ...(dateFilter.issueDate ?? {}),
      lte: new Date(toDate),
    };

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...statusFilter,
    ...dateFilter,
    ...(mode === "selected" ? { id: { in: ids } } : {}),
    ...(mode === "current_view" && q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            { referenceNumber: { contains: q, mode: "insensitive" as const } },
            {
              contact: {
                displayName: { contains: q, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const rows = await db.invoice.findMany({
    where,
    take: cap,
    orderBy: { issueDate: "desc" },
    include: { contact: { select: { displayName: true, email: true } } },
  });

  // M27: file format + decimal-format + PII-redaction + password
  const fileFormat = (() => {
    const f = sp.get("format")?.toLowerCase();
    return f === "xlsx" || f === "xls" ? f : "csv";
  })();
  const decimalStyle: "us" | "en" | "eu" = (() => {
    const d = sp.get("decimalFormat");
    return d === "en" || d === "eu" ? d : "us";
  })();
  const includePii = sp.get("includePii") === "true";
  const password = sp.get("password") ?? "";

  const records = rows.map((r) => {
    const base = {
      number: r.number,
      referenceNumber: r.referenceNumber ?? "",
      issueDate: format(r.issueDate, "yyyy-MM-dd"),
      dueDate: format(r.dueDate, "yyyy-MM-dd"),
      customerName: r.contact.displayName,
      customerEmail: includePii ? r.contact.email ?? "" : "",
      status: r.status,
      currency: r.currency ?? organization.currency,
      subtotal: formatDecimal(r.subtotal.toString(), decimalStyle),
      taxTotal: formatDecimal(r.taxTotal.toString(), decimalStyle),
      total: formatDecimal(r.total.toString(), decimalStyle),
      amountPaid: formatDecimal(r.amountPaid.toString(), decimalStyle),
      balance: formatDecimal(
        (Number(r.total) - Number(r.amountPaid)).toFixed(4),
        decimalStyle
      ),
    };
    return base;
  });

  if (fileFormat === "xlsx" || fileFormat === "xls") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Invoices");
    if (records.length > 0) {
      ws.columns = Object.keys(records[0]).map((key) => ({
        header: key,
        key,
        width: 18,
      }));
      ws.addRows(records);
      ws.getRow(1).font = { bold: true };
    }
    // exceljs supports xlsx encryption only when password is set
    const buffer = password
      ? await wb.xlsx.writeBuffer({
          // @ts-expect-error — exceljs types omit this option
          password,
        })
      : await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="quikfinance-invoices-${mode}-${Date.now()}.xlsx"`,
      },
    });
  }

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-invoices-${mode}-${Date.now()}.csv"`,
    },
  });
}
