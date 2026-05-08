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
 * M24: Bulk-print Delivery Challans. Per <delivery_challans_spec>
 * "Bulk: Mark Open, Print, Email, Delete".
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const ids = parseIds(req.nextUrl.searchParams.get("ids"));
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const challans = await db.deliveryChallan.findMany({
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
    challans.map(async (dc) => {
      const subTotal = dc.lineItems
        .reduce((sum, l) => sum + Number(l.amount), 0)
        .toFixed(4);
      return {
        filename: `delivery-challan-${dc.number}.pdf`,
        bytes: await renderSalesDocumentPdf({
          customFields: await loadVisibleCustomFields({
            organizationId: organization.id,
            entityType: "DELIVERY_CHALLAN",
            entityId: dc.id,
            surface: "pdf",
          }),
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
        }),
      };
    })
  );

  const zipBytes = await zipPdfs(items);
  return new NextResponse(zipBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="quikfinance-delivery-challans-${Date.now()}.zip"`,
    },
  });
}
