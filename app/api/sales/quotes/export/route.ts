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

  type QStatus =
    | "DRAFT"
    | "SENT"
    | "ACCEPTED"
    | "DECLINED"
    | "EXPIRED"
    | "INVOICED";
  const statusFilter =
    opts.status && opts.status !== "all"
      ? { status: opts.status as QStatus }
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

  const rows = await db.quote.findMany({
    where,
    take: cap,
    orderBy: { issueDate: "desc" },
    include: { contact: { select: { displayName: true, email: true } } },
  });

  const records = rows.map((r) => ({
    number: r.number,
    referenceNumber: r.referenceNumber ?? "",
    issueDate: format(r.issueDate, "yyyy-MM-dd"),
    expiryDate: r.expiryDate ? format(r.expiryDate, "yyyy-MM-dd") : "",
    customerName: r.contact.displayName,
    customerEmail: opts.includePii ? r.contact.email ?? "" : "",
    status: r.status,
    currency: r.currency,
    subTotal: formatDecimal(r.subTotal.toString(), opts.decimalStyle),
    discountValue: formatDecimal(r.discountValue.toString(), opts.decimalStyle),
    taxAmount: formatDecimal(r.taxAmount.toString(), opts.decimalStyle),
    adjustmentValue: formatDecimal(
      r.adjustmentValue.toString(),
      opts.decimalStyle
    ),
    total: formatDecimal(r.total.toString(), opts.decimalStyle),
    subject: r.subject ?? "",
    customerNotes: r.customerNotes ?? "",
  }));

  return writeExportResponse(opts, records, "quotes", mode);
}
