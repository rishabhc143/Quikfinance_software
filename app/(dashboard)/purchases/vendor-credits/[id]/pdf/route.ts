import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";

/**
 * GET /purchases/vendor-credits/[id]/pdf
 *
 * Reuses renderSalesDocumentPdf with type='VENDOR_CREDIT'. Per spec
 * the label shown in the PDF is "Credit Note" (matches the UI's
 * "Credit Note#" copy and Zoho-parity); only the module slug and
 * prefix differ from sales Credit Notes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const vc = await db.vendorCredit.findFirst({
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
  if (!vc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let vendorAddress: string | null = null;
  if (vc.contactId) {
    const billing = await db.contactAddress.findFirst({
      where: { contactId: vc.contactId, kind: "billing" },
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
    type: "VENDOR_CREDIT",
    organization: { name: vc.organization.name },
    document: {
      number: vc.number,
      date: format(vc.date, "dd MMM yyyy"),
      referenceNumber: vc.referenceNumber,
      subject: vc.subject,
      status: vc.status,
    },
    customer: {
      displayName: vc.contact.displayName,
      email: vc.contact.email,
      billingAddress: vendorAddress,
    },
    lines: vc.lineItems.map((l) => ({
      name: l.name || l.description || "",
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: vc.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: "0",
        amountWithTax: l.amount.toString(),
      })),
      subTotal: vc.subTotal.toString(),
      documentDiscountAmount: "0",
      documentTaxAmount: vc.taxAmount.toString(),
      adjustmentAmount: "0",
      total: vc.total.toString(),
    },
    notes: vc.notes,
    termsAndConditions: null,
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="credit-note-${vc.number}.pdf"`,
    },
  });
}
