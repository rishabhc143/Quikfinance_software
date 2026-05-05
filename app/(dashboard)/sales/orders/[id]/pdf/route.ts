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
  const so = await db.salesOrder.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
      organization: true,
    },
  });
  if (!so) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const html = renderSalesDocumentHtml({
    type: "SALES_ORDER",
    organization: { name: so.organization.name },
    document: {
      number: so.number,
      date: format(so.orderDate, "dd MMM yyyy"),
      dueDate: so.expectedShipmentDate ? format(so.expectedShipmentDate, "dd MMM yyyy") : undefined,
      referenceNumber: so.referenceNumber,
      status: so.status,
    },
    customer: {
      displayName: so.contact.displayName,
      email: so.contact.email,
      billingAddress: so.contact.billingAddress,
    },
    lines: so.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: so.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: l.taxAmount.toString(),
        amountWithTax: l.amount.toString(),
      })),
      subTotal: so.subTotal.toString(),
      documentDiscountAmount: so.discountValue.toString(),
      documentTaxAmount: so.taxAmount.toString(),
      adjustmentAmount: so.adjustmentValue.toString(),
      total: so.total.toString(),
    },
    notes: so.customerNotes,
    termsAndConditions: so.termsAndConditions,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="sales-order-${so.number}.html"`,
    },
  });
}
