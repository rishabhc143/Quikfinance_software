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
 * M24: Bulk-print Credit Notes — zip of per-id PDFs. Per
 * <credit_notes_spec> "Bulk: Print, Email, Delete".
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const ids = parseIds(req.nextUrl.searchParams.get("ids"));
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const notes = await db.creditNote.findMany({
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
    notes.map(async (cn) => ({
      filename: `credit-note-${cn.number}.pdf`,
      bytes: await renderSalesDocumentPdf({
        customFields: await loadVisibleCustomFields({
          organizationId: organization.id,
          entityType: "CREDIT_NOTE",
          entityId: cn.id,
          surface: "pdf",
        }),
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
      }),
    }))
  );

  const zipBytes = await zipPdfs(items);
  return new NextResponse(zipBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="quikfinance-credit-notes-${Date.now()}.zip"`,
    },
  });
}
