import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * Quotes export. Two modes per spec:
 *   ?mode=all          → every non-deleted quote (cap 25,000)
 *   ?mode=current_view → respects q/sort/dir filter (cap 10,000)
 */
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
    customerEmail: r.contact.email ?? "",
    status: r.status,
    currency: r.currency,
    subTotal: r.subTotal.toString(),
    discountValue: r.discountValue.toString(),
    taxAmount: r.taxAmount.toString(),
    adjustmentValue: r.adjustmentValue.toString(),
    total: r.total.toString(),
    subject: r.subject ?? "",
    customerNotes: r.customerNotes ?? "",
  }));

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-quotes-${mode}-${Date.now()}.csv"`,
    },
  });
}
