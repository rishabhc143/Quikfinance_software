import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentHtml } from "@/lib/sales/pdf-renderer";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: { contact: true, lineItems: true, organization: true },
  });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const html = renderSalesDocumentHtml({
    type: "INVOICE",
    organization: { name: inv.organization.name },
    document: {
      number: inv.number,
      date: format(inv.issueDate, "dd MMM yyyy"),
      dueDate: format(inv.dueDate, "dd MMM yyyy"),
      referenceNumber: inv.referenceNumber,
      status: inv.status,
    },
    customer: {
      displayName: inv.contact.displayName,
      email: inv.contact.email,
      billingAddress: inv.contact.billingAddress,
    },
    lines: inv.lineItems.map((l) => ({
      name: l.description,
      description: undefined,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: inv.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: "0",
        amountWithTax: l.amount.toString(),
      })),
      subTotal: inv.subtotal.toString(),
      documentDiscountAmount: inv.discountValue.toString(),
      documentTaxAmount: inv.taxTotal.toString(),
      adjustmentAmount: inv.adjustmentValue.toString(),
      total: inv.total.toString(),
    },
    notes: inv.customerNotes ?? inv.notes,
    termsAndConditions: inv.termsAndConditions ?? inv.terms,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="invoice-${inv.number}.html"`,
    },
  });
}
