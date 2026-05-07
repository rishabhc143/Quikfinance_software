import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";
import { parseIds, zipPdfs } from "@/lib/sales/bulk-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk-print Quotes — generates one PDF per id and returns them as a
 * single zip file. Per <quotes_spec> "Bulk Print" action.
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const ids = parseIds(req.nextUrl.searchParams.get("ids"));
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const quotes = await db.quote.findMany({
    where: {
      id: { in: ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
      organization: true,
    },
  });

  const items = await Promise.all(
    quotes.map(async (q) => ({
      filename: `quote-${q.number}.pdf`,
      bytes: await renderSalesDocumentPdf({
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
      }),
    }))
  );

  const zipBytes = await zipPdfs(items);
  return new NextResponse(zipBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="quikfinance-quotes-${Date.now()}.zip"`,
    },
  });
}
