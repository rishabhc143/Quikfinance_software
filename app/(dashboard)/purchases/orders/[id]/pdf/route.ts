import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";

/**
 * GET /purchases/orders/[id]/pdf
 *
 * Renders a Purchase Order to a PDF buffer using the shared
 * `renderSalesDocumentPdf` primitive (extended in P3-D to recognize
 * type='PURCHASE_ORDER'). Caller's organization context is enforced
 * — the route 404s if the PO doesn't belong to them.
 *
 * Returns `application/pdf` inline so browsers can preview, with
 * a sensible filename for "Save as".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      deletedAt: null,
    },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
      organization: true,
    },
  });
  if (!po) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Compose a one-line billing address from the vendor's
  // ContactAddress rows if present. Keeps the PDF terse rather than
  // forcing the vendor's full address block into the document.
  let vendorAddress: string | null = null;
  if (po.contactId) {
    const billing = await db.contactAddress.findFirst({
      where: { contactId: po.contactId, kind: "billing" },
    });
    if (billing) {
      vendorAddress = [
        billing.attention,
        billing.addressLine1,
        billing.addressLine2,
        [billing.city, billing.state, billing.zipCode]
          .filter(Boolean)
          .join(", "),
        billing.country,
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  const pdfBytes = await renderSalesDocumentPdf({
    type: "PURCHASE_ORDER",
    organization: { name: po.organization.name },
    document: {
      number: po.number,
      date: format(po.orderDate, "dd MMM yyyy"),
      dueDate: po.deliveryDate
        ? format(po.deliveryDate, "dd MMM yyyy")
        : undefined,
      referenceNumber: po.referenceNumber,
      status: po.status.replaceAll("_", " "),
    },
    customer: {
      displayName: po.contact.displayName,
      email: po.contact.email,
      billingAddress: vendorAddress,
    },
    lines: po.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: po.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: l.taxAmount.toString(),
        amountWithTax: l.amount.toString(),
      })),
      subTotal: po.subTotal.toString(),
      documentDiscountAmount: po.discountValue.toString(),
      documentTaxAmount: po.taxAmount.toString(),
      adjustmentAmount: po.adjustmentValue.toString(),
      total: po.total.toString(),
    },
    notes: po.notes,
    termsAndConditions: po.termsAndConditions,
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="purchase-order-${po.number}.pdf"`,
    },
  });
}
