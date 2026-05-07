"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";

export type DupHandling = "skip" | "overwrite";

export type ImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const HEADER_ALIASES: Record<string, string> = {
  "sales order number": "salesOrderNumber",
  "sales order#": "salesOrderNumber",
  "so#": "salesOrderNumber",
  "number": "salesOrderNumber",
  "reference number": "referenceNumber",
  "reference#": "referenceNumber",
  "customer name": "customerName",
  "customer": "customerName",
  "order date": "orderDate",
  "date": "orderDate",
  "expected shipment date": "expectedShipmentDate",
  "shipment date": "expectedShipmentDate",
  "amount": "total",
  "total": "total",
  "currency": "currency",
  "status": "status",
  "notes": "customerNotes",
};

function normalizeHeader(h: string): string {
  return (HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim()).slice(0, 80);
}

export async function importSalesOrdersAction(input: {
  csvText: string;
  dupHandling: DupHandling;
}): Promise<ImportResult> {
  const { user, organization } = await requireOrganization();
  const result: ImportResult = {
    parsed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  let rows: Record<string, string>[];
  try {
    rows = parse(input.csvText, {
      columns: (header: string[]) => header.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (err) {
    return {
      ...result,
      errors: [{ row: 0, message: `CSV parse failed: ${(err as Error).message}` }],
    };
  }

  result.parsed = rows.length;

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const customerName = r.customerName?.trim();
    if (!customerName) {
      result.errors.push({ row: i + 2, message: "customerName missing" });
      continue;
    }
    const contact = await db.contact.findFirst({
      where: {
        organizationId: organization.id,
        displayName: customerName,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!contact) {
      result.errors.push({
        row: i + 2,
        message: `customer "${customerName}" not found`,
      });
      continue;
    }

    const total = Number((r.total ?? "0").trim());
    if (Number.isNaN(total)) {
      result.errors.push({ row: i + 2, message: "total is not a number" });
      continue;
    }
    const orderDate = r.orderDate?.trim() ? new Date(r.orderDate.trim()) : new Date();
    const expectedShipmentDate = r.expectedShipmentDate?.trim()
      ? new Date(r.expectedShipmentDate.trim())
      : null;
    const soNumber = r.salesOrderNumber?.trim() || null;

    try {
      let existing: { id: string; status: string } | null = null;
      if (soNumber) {
        existing = await db.salesOrder.findFirst({
          where: {
            organizationId: organization.id,
            number: soNumber,
            deletedAt: null,
          },
          select: { id: true, status: true },
        });
      }

      if (existing) {
        if (input.dupHandling === "skip") {
          result.skipped += 1;
        } else {
          if (existing.status === "CLOSED" || existing.status === "VOID") {
            result.errors.push({
              row: i + 2,
              message: `SO ${soNumber} is ${existing.status}, cannot overwrite`,
            });
            continue;
          }
          await db.salesOrder.update({
            where: { id: existing.id },
            data: {
              referenceNumber: r.referenceNumber || null,
              contactId: contact.id,
              orderDate,
              expectedShipmentDate,
              currency: r.currency?.trim() || organization.currency,
              subTotal: total,
              total,
              customerNotes: r.customerNotes || null,
            },
          });
          result.updated += 1;
        }
      } else {
        const number = soNumber ?? (await getNextDocumentNumber(organization.id, "SALES_ORDER"));
        await db.salesOrder.create({
          data: {
            organizationId: organization.id,
            number,
            referenceNumber: r.referenceNumber || null,
            contactId: contact.id,
            status: "DRAFT",
            orderDate,
            expectedShipmentDate,
            currency: r.currency?.trim() || organization.currency,
            subTotal: total,
            total,
            customerNotes: r.customerNotes || null,
            lineItems: {
              create: [
                {
                  position: 0,
                  name: r.customerNotes?.slice(0, 200) || "Imported sales order",
                  description: r.customerNotes || null,
                  quantity: 1,
                  rate: total,
                  amount: total,
                },
              ],
            },
          },
        });
        result.created += 1;
      }
    } catch (err) {
      result.errors.push({
        row: i + 2,
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "SalesOrderImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/sales/orders");
  return result;
}
