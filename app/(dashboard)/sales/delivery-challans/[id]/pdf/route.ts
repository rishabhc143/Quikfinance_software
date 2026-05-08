import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";
import { loadVisibleCustomFields } from "@/lib/sales/custom-fields-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M24: Delivery Challan PDF route. Closes acceptance #11 for DCs.
 *
 * Delivery challans are non-financial — the line-item table renders
 * but totals show as zero. Customer name + reference + date + items
 * are the carriers of the document's value.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const dc = await db.deliveryChallan.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
      organization: true,
    },
  });
  if (!dc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const customFields = await loadVisibleCustomFields({
    organizationId: organization.id,
    entityType: "DELIVERY_CHALLAN",
    entityId: dc.id,
    surface: "pdf",
  });

  const subTotal = dc.lineItems
    .reduce((sum, l) => sum + Number(l.amount), 0)
    .toFixed(4);

  const pdfBytes = await renderSalesDocumentPdf({
    type: "DELIVERY_CHALLAN",
    organization: { name: dc.organization.name },
    document: {
      number: dc.number,
      date: format(dc.date, "dd MMM yyyy"),
      referenceNumber: dc.referenceNumber,
      status: dc.status,
    },
    customer: {
      displayName: dc.contact?.displayName ?? "—",
      email: dc.contact?.email ?? null,
      billingAddress: dc.contact?.billingAddress ?? null,
    },
    lines: dc.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: dc.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: l.taxAmount.toString(),
        amountWithTax: l.amount.toString(),
      })),
      subTotal,
      documentDiscountAmount: "0",
      documentTaxAmount: "0",
      adjustmentAmount: "0",
      total: subTotal,
    },
    notes: dc.customerNotes,
    termsAndConditions: dc.termsAndConditions,
    customFields,
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="delivery-challan-${dc.number}.pdf"`,
    },
  });
}
