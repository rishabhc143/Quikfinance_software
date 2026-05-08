import { NextRequest } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  formatDecimal,
  parseExportOptions,
  writeExportResponse,
} from "@/lib/sales/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invoices export. Modes: all | current_view | selected. M27 added the
 * rich-modal options (format/decimalFormat/includePii/password) +
 * Status + Date Range filters; M29 promoted the format/decimal helpers
 * to lib/sales/export.ts so all 8 module routes share them.
 */
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

  const opts = parseExportOptions(sp);

  type InvStatus =
    | "DRAFT"
    | "SENT"
    | "PARTIALLY_PAID"
    | "PAID"
    | "OVERDUE"
    | "VOID"
    | "WRITTEN_OFF";
  const statusFilter =
    opts.status && opts.status !== "all"
      ? opts.status === "unpaid"
        ? {
            status: {
              in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] as InvStatus[],
            },
          }
        : { status: opts.status as InvStatus }
      : {};
  const dateFilter: { issueDate?: { gte?: Date; lte?: Date } } = {};
  if (opts.fromDate) dateFilter.issueDate = { gte: new Date(opts.fromDate) };
  if (opts.toDate)
    dateFilter.issueDate = {
      ...(dateFilter.issueDate ?? {}),
      lte: new Date(opts.toDate),
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

  const records = rows.map((r) => ({
    number: r.number,
    referenceNumber: r.referenceNumber ?? "",
    issueDate: format(r.issueDate, "yyyy-MM-dd"),
    dueDate: format(r.dueDate, "yyyy-MM-dd"),
    customerName: r.contact.displayName,
    customerEmail: opts.includePii ? r.contact.email ?? "" : "",
    status: r.status,
    currency: r.currency ?? organization.currency,
    subtotal: formatDecimal(r.subtotal.toString(), opts.decimalStyle),
    taxTotal: formatDecimal(r.taxTotal.toString(), opts.decimalStyle),
    total: formatDecimal(r.total.toString(), opts.decimalStyle),
    amountPaid: formatDecimal(r.amountPaid.toString(), opts.decimalStyle),
    balance: formatDecimal(
      (Number(r.total) - Number(r.amountPaid)).toFixed(4),
      opts.decimalStyle
    ),
  }));

  return writeExportResponse(opts, records, "invoices", mode);
}
