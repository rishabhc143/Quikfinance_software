import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";
import { loadVisibleCustomFields } from "@/lib/sales/custom-fields-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M24: Credit Note PDF route. Closes acceptance #11 ("PDF download
 * works for ... Credit Note ...") which previously 404'd. Mirrors the
 * Quote/SO/Invoice route shape exactly — server-renders via
 * renderSalesDocumentPdf, includes Custom Fields per M20.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const cn = await db.creditNote.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
      organization: true,
    },
  });
  if (!cn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const customFields = await loadVisibleCustomFields({
    organizationId: organization.id,
    entityType: "CREDIT_NOTE",
    entityId: cn.id,
    surface: "pdf",
  });

  const pdfBytes = await renderSalesDocumentPdf({
    type: "CREDIT_NOTE",
    organization: { name: cn.organization.name },
    document: {
      number: cn.number,
      date: format(cn.date, "dd MMM yyyy"),
      referenceNumber: cn.referenceNumber,
      status: cn.status,
    },
    customer: {
      displayName: cn.contact.displayName,
      email: cn.contact.email,
      billingAddress: cn.contact.billingAddress,
    },
    lines: cn.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: cn.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: l.taxAmount.toString(),
        amountWithTax: l.amount.toString(),
      })),
      subTotal: cn.subTotal.toString(),
      documentDiscountAmount: "0",
      documentTaxAmount: cn.taxAmount.toString(),
      adjustmentAmount: "0",
      total: cn.total.toString(),
    },
    notes: cn.customerNotes ?? cn.reason,
    termsAndConditions: cn.termsAndConditions,
    customFields,
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="credit-note-${cn.number}.pdf"`,
    },
  });
}
