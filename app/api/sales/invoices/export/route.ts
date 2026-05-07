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
  const q = sp.get("q")?.trim() ?? "";
  const idsParam = sp.get("ids") ?? "";
  const ids =
    mode === "selected"
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1000)
      : [];
  const cap = mode === "all" ? 25_000 : mode === "current_view" ? 10_000 : 1_000;

  // M17f: Invoice export modal adds Status + Date Range filters per
  // Invoices Refinement Patch. Both apply across all three modes.
  const status = sp.get("status")?.trim();
  const fromDate = sp.get("from")?.trim();
  const toDate = sp.get("to")?.trim();
  type InvStatus =
    | "DRAFT"
    | "SENT"
    | "PARTIALLY_PAID"
    | "PAID"
    | "OVERDUE"
    | "VOID"
    | "WRITTEN_OFF";
  const statusFilter =
    status && status !== "all"
      ? status === "unpaid"
        ? {
            status: {
              in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] as InvStatus[],
            },
          }
        : { status: status as InvStatus }
      : {};
  const dateFilter: { issueDate?: { gte?: Date; lte?: Date } } = {};
  if (fromDate) dateFilter.issueDate = { gte: new Date(fromDate) };
  if (toDate)
    dateFilter.issueDate = {
      ...(dateFilter.issueDate ?? {}),
      lte: new Date(toDate),
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
