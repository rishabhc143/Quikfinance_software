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
            {
              contact: {
                displayName: { contains: q, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const rows = await db.creditNote.findMany({
    where,
    take: cap,
    orderBy: { date: "desc" },
    include: { contact: { select: { displayName: true } } },
  });

  const records = rows.map((r) => ({
    number: r.number,
    referenceNumber: r.referenceNumber ?? "",
    date: format(r.date, "yyyy-MM-dd"),
    customerName: r.contact.displayName,
    status: r.status,
    currency: r.currency,
    subTotal: r.subTotal.toString(),
    taxAmount: r.taxAmount.toString(),
    total: r.total.toString(),
    amountApplied: r.amountApplied.toString(),
    amountRefunded: r.amountRefunded.toString(),
    balance: (
      Number(r.total) -
      Number(r.amountApplied) -
      Number(r.amountRefunded)
    ).toFixed(4),
    reason: r.reason ?? "",
  }));

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-credit-notes-${mode}-${Date.now()}.csv"`,
    },
  });
}
