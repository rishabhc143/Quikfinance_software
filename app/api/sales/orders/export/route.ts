import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") === "current_view" ? "current_view" : "all";
  const q = sp.get("q")?.trim() ?? "";
  const cap = mode === "all" ? 25_000 : 10_000;

  const where = {
    organizationId: organization.id,
    deletedAt: null,
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
    customerEmail: r.contact.email ?? "",
    status: r.status,
    currency: r.currency,
    subTotal: r.subTotal.toString(),
    total: r.total.toString(),
  }));

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-sales-orders-${mode}-${Date.now()}.csv"`,
    },
  });
}
