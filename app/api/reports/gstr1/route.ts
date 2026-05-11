import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  generateGstr1,
  type Gstr1InvoiceInput,
} from "@/lib/sales/gstr1";

/**
 * GSTR-1 JSON export for a given tax period.
 *
 * GET /api/reports/gstr1?month=4&year=2026 → returns the GSTR-1 JSON
 * shape ready to upload to the GST portal (or feed to a 3rd-party
 * filing tool). Invoices in the period are filtered to non-deleted
 * SENT / PARTIALLY_PAID / PAID / OVERDUE rows (drafts and voids
 * aren't reported).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORTABLE_STATUSES = ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];

export async function GET(req: Request) {
  const { organization } = await requireOrganization();

  if (!organization.gstin) {
    return NextResponse.json(
      {
        error:
          "Organization GSTIN is not configured. Set it in Settings → Organization Profile before generating GSTR-1.",
      },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const month = parseInt(url.searchParams.get("month") ?? "", 10);
  const year = parseInt(url.searchParams.get("year") ?? "", 10);
  if (
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isFinite(year) ||
    year < 2017 ||
    year > 2100
  ) {
    return NextResponse.json(
      { error: "Provide month (1–12) and year (YYYY)." },
      { status: 400 }
    );
  }

  // [periodStart, periodEnd) — UTC for stability.
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      status: { in: REPORTABLE_STATUSES as never },
      issueDate: { gte: periodStart, lt: periodEnd },
    },
    include: {
      contact: { select: { gstin: true, placeOfSupply: true } },
      lineItems: {
        include: {
          item: { select: { name: true } },
        },
      },
    },
  });

  // Look up tax rates (the line items reference Tax.id only).
  const taxIds = Array.from(
    new Set(
      invoices.flatMap((inv) =>
        inv.lineItems
          .map((l) => l.taxId)
          .filter((id): id is string => !!id)
      )
    )
  );
  const taxes = taxIds.length
    ? await db.tax.findMany({
        where: { organizationId: organization.id, id: { in: taxIds } },
        select: { id: true, rate: true },
      })
    : [];
  const taxRateById = new Map(taxes.map((t) => [t.id, Number(t.rate)]));

  const inputs: Gstr1InvoiceInput[] = invoices.map((inv) => ({
    number: inv.number,
    date: inv.issueDate,
    invoiceValue: Number(inv.total),
    customerGstin: inv.contact.gstin ?? null,
    customerStateCode: inv.contact.placeOfSupply ?? null,
    reverseCharge: false,
    lines: inv.lineItems.map((l) => ({
      taxableValue: Number(l.amount),
      rate: l.taxId ? taxRateById.get(l.taxId) ?? 0 : 0,
      quantity: Number(l.quantity),
      unit: null,
      hsnSacCode: l.hsnSacCode ?? null,
      description: l.description ?? l.item?.name ?? null,
    })),
  }));

  const output = generateGstr1(inputs, {
    supplierGstin: organization.gstin,
    month,
    year,
  });

  const fp = `${String(month).padStart(2, "0")}${year}`;
  const filename = `gstr1-${fp}-${organization.gstin}.json`;
  return new NextResponse(JSON.stringify(output, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
