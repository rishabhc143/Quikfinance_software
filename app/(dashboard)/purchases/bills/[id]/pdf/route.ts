import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";

/**
 * GET /purchases/bills/[id]/pdf
 *
 * Per <bills_spec>: Bills are NEVER emailed (they're an internal A/P
 * record, not a vendor-facing doc), but the user can still print /
 * save them as PDF for their records. Reuses the shared
 * renderSalesDocumentPdf primitive with type='BILL'; the renderer
 * swaps the "Bill to" header label to "Vendor" for the vendor-side
 * doc types.
 *
 * Org-scoped — 404s if the bill doesn't belong to the requester.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const b = await db.bill.findFirst({
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
  if (!b) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Compose a one-line vendor billing address from ContactAddress.
  let vendorAddress: string | null = null;
  if (b.contactId) {
    const billing = await db.contactAddress.findFirst({
      where: { contactId: b.contactId, kind: "billing" },
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

  const cur = b.currency ?? organization.currency;

  const pdfBytes = await renderSalesDocumentPdf({
    type: "BILL",
    organization: { name: b.organization.name },
    document: {
      number: b.number,
      date: format(b.issueDate, "dd MMM yyyy"),
      dueDate: format(b.dueDate, "dd MMM yyyy"),
      referenceNumber: b.referenceNumber,
      subject: b.subject,
      status: b.status.replaceAll("_", " "),
    },
    customer: {
      displayName: b.contact.displayName,
      email: b.contact.email,
      billingAddress: vendorAddress,
    },
    lines: b.lineItems.map((l) => ({
      name: l.name || l.description || "",
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: b.lineItems.map((l) => ({
        amount: l.amount.toString(),
        // Bill lines store no per-line tax — surface a zero so the
        // renderer's totals stay consistent.
        taxAmount: "0",
        amountWithTax: l.amount.toString(),
      })),
      subTotal: b.subtotal.toString(),
      documentDiscountAmount: b.discountValue.toString(),
      documentTaxAmount: b.taxTotal.toString(),
      adjustmentAmount: b.adjustmentValue.toString(),
      total: b.total.toString(),
    },
    // Notes are internal-only on bills — explicitly DO NOT include
    // them in the PDF per spec.
    notes: null,
    termsAndConditions: b.termsAndConditions,
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bill-${b.number}.pdf"`,
    },
  });
  // Cur is unused above but reserved for currency-aware formatting
  // in a future renderer pass.
  void cur;
}
