import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";
import { loadVisibleCustomFields } from "@/lib/sales/custom-fields-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M24: Debit Note PDF route. Mirrors the M23 detail page shape.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const dn = await db.debitNote.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
    },
  });
  if (!dn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const customFields = await loadVisibleCustomFields({
    organizationId: organization.id,
    entityType: "DEBIT_NOTE",
    entityId: dn.id,
    surface: "pdf",
  });

  const pdfBytes = await renderSalesDocumentPdf({
    type: "DEBIT_NOTE",
    organization: { name: organization.name },
    document: {
      number: dn.debitNoteNumber,
      date: format(dn.debitNoteDate, "dd MMM yyyy"),
      referenceNumber: dn.referenceNumber,
      status: dn.status,
    },
    customer: {
      displayName: dn.contact.displayName,
      email: dn.contact.email,
      billingAddress: dn.contact.billingAddress,
    },
    lines: dn.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: dn.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: l.taxAmount.toString(),
        amountWithTax: l.amount.toString(),
      })),
      subTotal: dn.subTotal.toString(),
      documentDiscountAmount: "0",
      documentTaxAmount: dn.taxAmount.toString(),
      adjustmentAmount: "0",
      total: dn.total.toString(),
    },
    notes: dn.customerNotes ?? dn.reason,
    termsAndConditions: dn.termsAndConditions,
    customFields,
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="debit-note-${dn.debitNoteNumber}.pdf"`,
    },
  });
}
