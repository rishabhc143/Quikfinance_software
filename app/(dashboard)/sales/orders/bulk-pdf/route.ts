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
 * Bulk-print Sales Orders — zip of per-id PDFs. Per <sales_orders_spec>
 * "Bulk Print".
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const ids = parseIds(req.nextUrl.searchParams.get("ids"));
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  const orders = await db.salesOrder.findMany({
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
    orders.map(async (so) => ({
      filename: `sales-order-${so.number}.pdf`,
      bytes: await renderSalesDocumentPdf({
        customFields: await loadVisibleCustomFields({
          organizationId: organization.id,
          entityType: "SALES_ORDER",
          entityId: so.id,
          surface: "pdf",
        }),
        type: "SALES_ORDER",
        organization: { name: so.organization.name },
        document: {
          number: so.number,
          date: format(so.orderDate, "dd MMM yyyy"),
          dueDate: so.expectedShipmentDate
            ? format(so.expectedShipmentDate, "dd MMM yyyy")
            : undefined,
          referenceNumber: so.referenceNumber,
          status: so.status,
        },
        customer: {
          displayName: so.contact.displayName,
          email: so.contact.email,
          billingAddress: so.contact.billingAddress,
        },
        lines: so.lineItems.map((l) => ({
          name: l.name,
          description: l.description,
          quantity: l.quantity.toString(),
          rate: l.rate.toString(),
          amount: l.amount.toString(),
        })),
        totals: {
          lines: so.lineItems.map((l) => ({
            amount: l.amount.toString(),
            taxAmount: l.taxAmount.toString(),
            amountWithTax: l.amount.toString(),
          })),
          subTotal: so.subTotal.toString(),
          documentDiscountAmount: so.discountValue.toString(),
          documentTaxAmount: so.taxAmount.toString(),
          adjustmentAmount: so.adjustmentValue.toString(),
          total: so.total.toString(),
        },
        notes: so.customerNotes,
        termsAndConditions: so.termsAndConditions,
      }),
    }))
  );

  const zipBytes = await zipPdfs(items);
  return new NextResponse(zipBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="quikfinance-sales-orders-${Date.now()}.zip"`,
    },
  });
}
