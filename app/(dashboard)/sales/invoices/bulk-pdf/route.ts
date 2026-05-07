import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";
import { loadVisibleCustomFields } from "@/lib/sales/custom-fields-loader";
import { parseIds, zipPdfs } from "@/lib/sales/bulk-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk-print Invoices — zip of per-id PDFs. Per <invoices_spec> "Bulk
 * Print".
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const ids = parseIds(req.nextUrl.searchParams.get("ids"));
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const invoices = await db.invoice.findMany({
    where: {
      id: { in: ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    include: {
      contact: true,
      lineItems: true,
      organization: true,
    },
  });

  const items = await Promise.all(
    invoices.map(async (inv) => ({
      filename: `invoice-${inv.number}.pdf`,
      bytes: await renderSalesDocumentPdf({
        customFields: await loadVisibleCustomFields({
          organizationId: organization.id,
          entityType: "INVOICE",
          entityId: inv.id,
          surface: "pdf",
        }),
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
      }),
    }))
  );

  const zipBytes = await zipPdfs(items);
  return new NextResponse(zipBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="quikfinance-invoices-${Date.now()}.zip"`,
    },
  });
}
