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
 * M24: Bulk-print Debit Notes — zip of per-id PDFs.
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const ids = parseIds(req.nextUrl.searchParams.get("ids"));
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const notes = await db.debitNote.findMany({
    where: {
      id: { in: ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
    },
  });

  const items = await Promise.all(
    notes.map(async (dn) => ({
      filename: `debit-note-${dn.debitNoteNumber}.pdf`,
      bytes: await renderSalesDocumentPdf({
        customFields: await loadVisibleCustomFields({
          organizationId: organization.id,
          entityType: "DEBIT_NOTE",
          entityId: dn.id,
          surface: "pdf",
        }),
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
      }),
    }))
  );

  const zipBytes = await zipPdfs(items);
  return new NextResponse(zipBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="quikfinance-debit-notes-${Date.now()}.zip"`,
    },
  });
}
