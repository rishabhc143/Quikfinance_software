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

  const dateFilter: { paymentDate?: { gte?: Date; lte?: Date } } = {};
  if (opts.fromDate) dateFilter.paymentDate = { gte: new Date(opts.fromDate) };
  if (opts.toDate)
    dateFilter.paymentDate = {
      ...(dateFilter.paymentDate ?? {}),
      lte: new Date(opts.toDate),
    };

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...dateFilter,
    ...(mode === "selected" ? { id: { in: ids } } : {}),
    ...(mode === "current_view" && q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            { reference: { contains: q, mode: "insensitive" as const } },
            {
              contact: {
                displayName: { contains: q, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const rows = await db.paymentReceived.findMany({
    where,
    take: cap,
    orderBy: { paymentDate: "desc" },
    include: {
      contact: { select: { displayName: true } },
      allocations: { select: { invoice: { select: { number: true } } } },
    },
  });

  const records = rows.map((r) => ({
    number: r.number,
    paymentDate: format(r.paymentDate, "yyyy-MM-dd"),
    customerName: r.contact.displayName,
    paymentMode: r.paymentMode ?? "",
    reference: r.reference ?? "",
    amount: formatDecimal(r.amount.toString(), opts.decimalStyle),
    amountUsedForInvoices: formatDecimal(
      r.amountUsedForInvoices.toString(),
      opts.decimalStyle
    ),
    amountInExcess: formatDecimal(
      r.amountInExcess.toString(),
      opts.decimalStyle
    ),
    bankCharges: formatDecimal(r.bankCharges.toString(), opts.decimalStyle),
    appliedInvoices: r.allocations.map((a) => a.invoice.number).join("; "),
    notes: r.notes ?? "",
  }));

  return writeExportResponse(opts, records, "payments-received", mode);
}
