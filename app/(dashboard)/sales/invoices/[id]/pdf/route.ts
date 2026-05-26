import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { renderSalesDocumentPdf } from "@/lib/sales/pdf-document";
import { loadVisibleCustomFields } from "@/lib/sales/custom-fields-loader";
import { formatTotalInWords } from "@/lib/sales/total-in-words";
import { groupByTaxRate, type LineForTax } from "@/lib/sales/invoice-tax-breakdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: true,
      organization: true,
    },
  });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Load all tax records used by this invoice's lines so we can
  // resolve per-line tax rate without N+1 queries.
  const taxIds = Array.from(
    new Set(
      inv.lineItems
        .map((l) => l.taxId)
        .filter((t): t is string => Boolean(t))
    )
  );
  const taxes = taxIds.length
    ? await db.tax.findMany({
        where: { id: { in: taxIds }, organizationId: organization.id },
      })
    : [];
  const taxById = new Map<string, (typeof taxes)[number]>(
    taxes.map((t) => [t.id, t])
  );

  // Look up linked Items so the PDF can render the item name as the
  // bold first line of the description cell (e.g. "PROFESSIONAL
  // SERVICE CHARGES" on the Moreyeahs/Zoho reference layout) and
  // fill the per-line unit (e.g. "Nos") below the quantity.
  const itemIds = Array.from(
    new Set(
      inv.lineItems
        .map((l) => l.itemId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const items = itemIds.length
    ? await db.item.findMany({
        where: { id: { in: itemIds }, organizationId: organization.id },
        select: { id: true, name: true, unit: true },
      })
    : [];
  const itemById = new Map<string, (typeof items)[number]>(
    items.map((it) => [it.id, it])
  );

  const customFields = await loadVisibleCustomFields({
    organizationId: organization.id,
    entityType: "INVOICE",
    entityId: inv.id,
    surface: "pdf",
  });

  // Build per-line tax breakdown for the totals stack.
  const linesForTax: LineForTax[] = inv.lineItems.map((l) => {
    const tax = l.taxId ? taxById.get(l.taxId) : undefined;
    const rate = tax ? Number(tax.rate) : 0;
    return {
      amount: Number(l.amount),
      taxRate: rate,
      // IGST for inter-state; we don't currently store the
      // intra/inter split, so default to IGST. CGST+SGST split is
      // a follow-up enhancement.
      taxKind: "IGST",
    };
  });
  const taxBreakdown = groupByTaxRate(linesForTax).map((b) => ({
    label: b.label,
    amount: String(b.amount),
  }));

  // Total in Words from the grand total.
  const totalInWords = formatTotalInWords(Number(inv.total));

  // Balance Due = total minus amount paid. Falls back to total
  // if amountPaid is null/zero.
  const balance = Number(inv.total) - Number(inv.amountPaid ?? 0);

  const billingAddress =
    inv.contact.billingAddress ??
    [
      inv.contact.displayName,
      // (the legacy contact form stores everything in billingAddress free-form)
    ]
      .filter(Boolean)
      .join("\n");

  // Derive "Place of Supply" — prefer Contact.placeOfSupply (set
  // on customer); fall back to a state hint extracted from
  // billing address if present.
  const placeOfSupply = inv.contact.placeOfSupply ?? null;

  const pdfBytes = await renderSalesDocumentPdf({
    type: "INVOICE",
    organization: {
      name: inv.organization.name,
      address: inv.organization.address,
      phoneNumber: inv.organization.phoneNumber,
      email: inv.organization.email,
      gstin: inv.organization.gstin,
      logoUrl: inv.organization.logoUrl,
    },
    document: {
      number: inv.number,
      date: format(inv.issueDate, "dd/MM/yyyy"),
      dueDate: format(inv.dueDate, "dd/MM/yyyy"),
      referenceNumber: inv.referenceNumber,
      status: inv.status,
      terms: inv.terms,
      placeOfSupply,
    },
    customer: {
      displayName: inv.contact.displayName,
      email: inv.contact.email,
      billingAddress,
      shippingAddress: inv.contact.shippingAddress ?? billingAddress,
      gstin: inv.contact.gstin,
    },
    lines: inv.lineItems.map((l) => {
      const tax = l.taxId ? taxById.get(l.taxId) : undefined;
      const rate = tax ? Number(tax.rate) : 0;
      const amount = Number(l.amount);
      const item = l.itemId ? itemById.get(l.itemId) : undefined;

      // Bold name = linked Item.name when present, else the first
      // line of the free-text description. Remaining lines flow into
      // the description block below the bold header.
      const descriptionLines = (l.description ?? "").split(/\r?\n/);
      let name: string;
      let description: string | undefined;
      if (item?.name) {
        name = item.name;
        description = (l.description ?? "").trim() || undefined;
      } else {
        name = (descriptionLines[0] ?? "").trim();
        const rest = descriptionLines.slice(1).join("\n").trim();
        description = rest || undefined;
      }

      return {
        name,
        description,
        quantity: l.quantity.toString(),
        rate: l.rate.toString(),
        amount: l.amount.toString(),
        hsnSac: l.hsnSacCode,
        taxRate: rate || null,
        taxAmount: rate ? Math.round(((amount * rate) / 100) * 100) / 100 : null,
        unit: item?.unit ?? null,
      };
    }),
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
    taxBreakdown,
    totalInWords,
    balanceDue: balance.toFixed(2),
    notes: inv.customerNotes ?? inv.notes,
    termsAndConditions: inv.termsAndConditions,
    customFields,
  });

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${inv.number}.pdf"`,
    },
  });
}
