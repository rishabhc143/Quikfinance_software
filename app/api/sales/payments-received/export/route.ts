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
    amount: r.amount.toString(),
    amountUsedForInvoices: r.amountUsedForInvoices.toString(),
    amountInExcess: r.amountInExcess.toString(),
    bankCharges: r.bankCharges.toString(),
    appliedInvoices: r.allocations.map((a) => a.invoice.number).join("; "),
    notes: r.notes ?? "",
  }));

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-payments-received-${mode}-${Date.now()}.csv"`,
    },
  });
}
