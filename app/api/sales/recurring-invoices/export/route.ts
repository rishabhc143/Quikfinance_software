import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

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
  const idsParam = sp.get("ids") ?? "";
  const ids =
    mode === "selected"
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1000)
      : [];
  const cap = mode === "all" ? 25_000 : mode === "current_view" ? 10_000 : 1_000;

  const rows = await db.recurringInvoice.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      ...(mode === "selected" ? { id: { in: ids } } : {}),
    },
    take: cap,
    orderBy: { nextOccurrenceDate: "asc" },
    include: { contact: { select: { displayName: true } } },
  });

  const records = rows.map((r) => ({
    profileName: r.profileName,
    customerName: r.contact.displayName,
    frequency:
      r.frequency === "EVERY_N_MONTHS"
        ? `Every ${r.intervalN} months`
        : r.frequency,
    startDate: format(r.startDate, "yyyy-MM-dd"),
    endDate: r.endDate ? format(r.endDate, "yyyy-MM-dd") : "",
    neverExpires: r.neverExpires ? "true" : "false",
    nextOccurrenceDate: format(r.nextOccurrenceDate, "yyyy-MM-dd"),
    occurrencesGenerated: String(r.occurrencesGenerated),
    status: r.status,
    amount: r.amount.toString(),
    emailAutomatically: r.emailAutomatically ? "true" : "false",
  }));

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-recurring-invoices-${mode}-${Date.now()}.csv"`,
    },
  });
}
