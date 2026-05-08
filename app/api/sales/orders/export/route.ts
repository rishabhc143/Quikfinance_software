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

  type SOStatus = "DRAFT" | "CONFIRMED" | "CLOSED" | "VOID";
  const statusFilter =
    opts.status && opts.status !== "all"
      ? { status: opts.status as SOStatus }
      : {};
  const dateFilter: { orderDate?: { gte?: Date; lte?: Date } } = {};
  if (opts.fromDate) dateFilter.orderDate = { gte: new Date(opts.fromDate) };
  if (opts.toDate)
    dateFilter.orderDate = {
      ...(dateFilter.orderDate ?? {}),
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

  const rows = await db.salesOrder.findMany({
    where,
    take: cap,
    orderBy: { orderDate: "desc" },
    include: { contact: { select: { displayName: true, email: true } } },
  });

  const records = rows.map((r) => ({
    number: r.number,
    referenceNumber: r.referenceNumber ?? "",
    orderDate: format(r.orderDate, "yyyy-MM-dd"),
    expectedShipmentDate: r.expectedShipmentDate
      ? format(r.expectedShipmentDate, "yyyy-MM-dd")
      : "",
    customerName: r.contact.displayName,
    customerEmail: opts.includePii ? r.contact.email ?? "" : "",
    status: r.status,
    currency: r.currency,
    subTotal: formatDecimal(r.subTotal.toString(), opts.decimalStyle),
    total: formatDecimal(r.total.toString(), opts.decimalStyle),
  }));

  return writeExportResponse(opts, records, "sales-orders", mode);
}
