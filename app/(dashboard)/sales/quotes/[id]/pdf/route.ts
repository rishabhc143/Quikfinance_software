import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const q = await db.quote.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
      organization: true,
    },
  });
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdfBytes = await renderSalesDocumentPdf({
    type: "QUOTE",
    organization: { name: q.organization.name },
    document: {
      number: q.number,
      date: format(q.issueDate, "dd MMM yyyy"),
      dueDate: q.expiryDate ? format(q.expiryDate, "dd MMM yyyy") : undefined,
      referenceNumber: q.referenceNumber,
      subject: q.subject,
      status: q.status,
    },
    customer: {
      displayName: q.contact.displayName,
      email: q.contact.email,
      billingAddress: q.contact.billingAddress,
    },
    lines: q.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: q.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: l.taxAmount.toString(),
        amountWithTax: l.amount.toString(),
      })),
      subTotal: q.subTotal.toString(),
      documentDiscountAmount: q.discountValue.toString(),
      documentTaxAmount: q.taxAmount.toString(),
      adjustmentAmount: q.adjustmentValue.toString(),
      total: q.total.toString(),
    },
    notes: q.customerNotes,
    termsAndConditions: q.termsAndConditions,
  });

  // Convert Buffer to a fresh Uint8Array (NextResponse requires
  // BodyInit-compatible bytes; reusing the underlying buffer's slice is the
  // canonical pattern).
  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quote-${q.number}.pdf"`,
    },
  });
}
