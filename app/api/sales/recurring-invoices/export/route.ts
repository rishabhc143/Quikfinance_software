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
  const idsParam = sp.get("ids") ?? "";
  const ids =
    mode === "selected"
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1000)
      : [];
  const cap = mode === "all" ? 25_000 : mode === "current_view" ? 10_000 : 1_000;

  const opts = parseExportOptions(sp);

  const statusFilter =
    opts.status && opts.status !== "all" ? { status: opts.status } : {};
  const dateFilter: { startDate?: { gte?: Date; lte?: Date } } = {};
  if (opts.fromDate) dateFilter.startDate = { gte: new Date(opts.fromDate) };
  if (opts.toDate)
    dateFilter.startDate = {
      ...(dateFilter.startDate ?? {}),
      lte: new Date(opts.toDate),
    };

  const rows = await db.recurringInvoice.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      ...statusFilter,
      ...dateFilter,
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
    amount: formatDecimal(r.amount.toString(), opts.decimalStyle),
    emailAutomatically: r.emailAutomatically ? "true" : "false",
  }));

  return writeExportResponse(opts, records, "recurring-invoices", mode);
}
