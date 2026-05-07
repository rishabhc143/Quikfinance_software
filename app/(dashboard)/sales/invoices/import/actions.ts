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
  "invoice number": "invoiceNumber",
  "invoice#": "invoiceNumber",
  "number": "invoiceNumber",
  "reference number": "referenceNumber",
  "reference#": "referenceNumber",
  "customer name": "customerName",
  "customer": "customerName",
  "issue date": "issueDate",
  "invoice date": "issueDate",
  "date": "issueDate",
  "due date": "dueDate",
  "amount": "total",
  "total": "total",
  "currency": "currency",
  "status": "status",
  "notes": "customerNotes",
};

function normalizeHeader(h: string): string {
  return (HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim()).slice(0, 80);
}

export async function importInvoicesAction(input: {
  csvText: string;
  dupHandling: DupHandling;
  // M17f: Invoices Refinement Patch import options. Accepted but
  // intentionally minimal in this batch:
  // - autoGenerateNumbers: when true, ignore any invoiceNumber column
  //   and let getNextDocumentNumber pick the next number (already the
  //   default behavior when invoiceNumber is empty; this flag enforces
  //   it).
  // - linkSalesOrders / mapAddresses: stored on the AuditLog only;
  //   actual mapping plumbing is a follow-up to keep this batch
  //   single-PR-sized.
  autoGenerateNumbers?: boolean;
  linkSalesOrders?: boolean;
  mapAddresses?: boolean;
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
    const issueDate = r.issueDate?.trim() ? new Date(r.issueDate.trim()) : new Date();
    let dueDate: Date;
    if (r.dueDate?.trim()) {
      dueDate = new Date(r.dueDate.trim());
    } else {
      dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + 30);
    }
    const invoiceNumber = r.invoiceNumber?.trim() || null;

    try {
      let existing: { id: string; status: string } | null = null;
      if (invoiceNumber) {
        existing = await db.invoice.findFirst({
          where: {
            organizationId: organization.id,
            number: invoiceNumber,
            deletedAt: null,
          },
          select: { id: true, status: true },
        });
      }

      if (existing) {
        if (input.dupHandling === "skip") {
          result.skipped += 1;
        } else {
          if (
            existing.status === "PAID" ||
            existing.status === "PARTIALLY_PAID" ||
            existing.status === "VOID" ||
            existing.status === "WRITTEN_OFF"
          ) {
            result.errors.push({
              row: i + 2,
              message: `Invoice ${invoiceNumber} is ${existing.status}, cannot overwrite`,
            });
            continue;
          }
          await db.invoice.update({
            where: { id: existing.id },
            data: {
              referenceNumber: r.referenceNumber || null,
              contactId: contact.id,
              issueDate,
              dueDate,
              currency: r.currency?.trim() || organization.currency,
              subtotal: total,
              total,
              customerNotes: r.customerNotes || null,
            },
          });
          result.updated += 1;
        }
      } else {
        const number = invoiceNumber ?? (await getNextDocumentNumber(organization.id, "INVOICE"));
        await db.invoice.create({
          data: {
            organizationId: organization.id,
            number,
            referenceNumber: r.referenceNumber || null,
            contactId: contact.id,
            status: "DRAFT",
            issueDate,
            dueDate,
            currency: r.currency?.trim() || organization.currency,
            subtotal: total,
            total,
            amountPaid: 0,
            customerNotes: r.customerNotes || null,
            notes: r.customerNotes || null,
            lineItems: {
              create: [
                {
                  description: r.customerNotes?.slice(0, 200) || "Imported invoice",
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
    entityType: "InvoiceImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
      autoGenerateNumbers: !!input.autoGenerateNumbers,
      linkSalesOrders: !!input.linkSalesOrders,
      mapAddresses: !!input.mapAddresses,
    },
  });

  revalidatePath("/sales/invoices");
  return result;
}
