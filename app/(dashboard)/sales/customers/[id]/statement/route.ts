import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  renderCustomerStatementPdf,
  type StatementRow,
} from "@/lib/sales/statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generate a customer statement PDF for the given date range.
 * Per <customers_spec> Statements tab + getCustomerStatementPdf action.
 *
 *   GET /sales/customers/[id]/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();

  const sp = req.nextUrl.searchParams;
  const fromStr = sp.get("from");
  const toStr = sp.get("to");
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setMonth(defaultFrom.getMonth() - 12);
  const rangeFrom = fromStr ? new Date(fromStr) : defaultFrom;
  const rangeTo = toStr ? new Date(toStr) : today;

  const c = await db.contact.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    select: { id: true, displayName: true, email: true, currency: true },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // All in-range invoices and payments for this contact
  const [invoices, payments, creditNotes] = await Promise.all([
    db.invoice.findMany({
      where: {
        organizationId: organization.id,
        contactId: c.id,
        deletedAt: null,
        issueDate: { gte: rangeFrom, lte: rangeTo },
      },
      orderBy: { issueDate: "asc" },
      select: { number: true, issueDate: true, total: true },
    }),
    db.paymentReceived.findMany({
      where: {
        organizationId: organization.id,
        contactId: c.id,
        deletedAt: null,
        paymentDate: { gte: rangeFrom, lte: rangeTo },
      },
      orderBy: { paymentDate: "asc" },
      select: {
        number: true,
        paymentDate: true,
        amount: true,
        paymentMode: true,
      },
    }),
    db.creditNote.findMany({
      where: {
        organizationId: organization.id,
        contactId: c.id,
        deletedAt: null,
        date: { gte: rangeFrom, lte: rangeTo },
      },
      orderBy: { date: "asc" },
      select: { number: true, date: true, total: true },
    }),
  ]);

  // Compute opening balance: sum of (invoices.total - allocations.amount) before rangeFrom
  const priorInvoices = await db.invoice.findMany({
    where: {
      organizationId: organization.id,
      contactId: c.id,
      deletedAt: null,
      issueDate: { lt: rangeFrom },
    },
    select: { total: true, amountPaid: true },
  });
  const priorOpenBalance = priorInvoices.reduce(
    (sum, i) => sum + Number(i.total) - Number(i.amountPaid),
    0
  );

  type Row = StatementRow;
  const merged: Row[] = [];
  for (const inv of invoices) {
    merged.push({
      date: inv.issueDate,
      type: "Invoice",
      number: inv.number,
      description: null,
      amount: Number(inv.total),
      balance: 0,
    });
  }
  for (const p of payments) {
    merged.push({
      date: p.paymentDate,
      type: "Payment",
      number: p.number,
      description: p.paymentMode ?? null,
      amount: -Number(p.amount),
      balance: 0,
    });
  }
  for (const cn of creditNotes) {
    merged.push({
      date: cn.date,
      type: "Credit Note",
      number: cn.number,
      description: null,
      amount: -Number(cn.total),
      balance: 0,
    });
  }
  merged.sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = priorOpenBalance;
  for (const r of merged) {
    running += r.amount;
    r.balance = running;
  }

  const pdfBytes = await renderCustomerStatementPdf({
    organization: { name: organization.name },
    customer: { displayName: c.displayName, email: c.email ?? null },
    rangeFrom,
    rangeTo,
    openingBalance: priorOpenBalance,
    closingBalance: running,
    currency: c.currency ?? organization.currency,
    rows: merged,
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="statement-${c.displayName.replace(/\s+/g, "_")}-${rangeFrom.toISOString().slice(0, 10)}_to_${rangeTo.toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
