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
    customerEmail: r.contact.email ?? "",
    status: r.status,
    currency: r.currency ?? organization.currency,
    subtotal: r.subtotal.toString(),
    taxTotal: r.taxTotal.toString(),
    total: r.total.toString(),
    amountPaid: r.amountPaid.toString(),
    balance: (Number(r.total) - Number(r.amountPaid)).toFixed(4),
  }));

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-invoices-${mode}-${Date.now()}.csv"`,
    },
  });
}
