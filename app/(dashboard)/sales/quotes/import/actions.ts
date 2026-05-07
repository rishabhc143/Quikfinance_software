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
  "quote number": "quoteNumber",
  "quote#": "quoteNumber",
  "number": "quoteNumber",
  "reference number": "referenceNumber",
  "reference#": "referenceNumber",
  "ref#": "referenceNumber",
  "customer name": "customerName",
  "customer": "customerName",
  "issue date": "issueDate",
  "quote date": "issueDate",
  "date": "issueDate",
  "expiry date": "expiryDate",
  "expiry": "expiryDate",
  "subject": "subject",
  "amount": "total",
  "total": "total",
  "currency": "currency",
  "status": "status",
  "notes": "customerNotes",
};

function normalizeHeader(h: string): string {
  return (HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim()).slice(0, 80);
}

export async function importQuotesAction(input: {
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

    const totalRaw = (r.total ?? "0").trim();
    const total = Number(totalRaw);
    if (Number.isNaN(total)) {
      result.errors.push({
        row: i + 2,
        message: `total "${totalRaw}" is not a number`,
      });
      continue;
    }

    const issueDateRaw = r.issueDate?.trim() || null;
    const issueDate = issueDateRaw ? new Date(issueDateRaw) : new Date();
    const expiryDateRaw = r.expiryDate?.trim() || null;
    const expiryDate = expiryDateRaw ? new Date(expiryDateRaw) : null;

    const quoteNumber = r.quoteNumber?.trim() || null;

    try {
      let existing = null as { id: string; status: string } | null;
      if (quoteNumber) {
        existing = await db.quote.findFirst({
          where: {
            organizationId: organization.id,
            number: quoteNumber,
            deletedAt: null,
          },
          select: { id: true, status: true },
        });
      }

      if (existing) {
        if (input.dupHandling === "skip") {
          result.skipped += 1;
        } else {
          if (existing.status === "INVOICED") {
            result.errors.push({
              row: i + 2,
              message: `Quote ${quoteNumber} is INVOICED, cannot overwrite`,
            });
            continue;
          }
          await db.quote.update({
            where: { id: existing.id },
            data: {
              referenceNumber: r.referenceNumber || null,
              contactId: contact.id,
              issueDate,
              expiryDate,
              subject: r.subject || null,
              currency: r.currency?.trim() || organization.currency,
              total,
              subTotal: total,
              customerNotes: r.customerNotes || null,
            },
          });
          result.updated += 1;
        }
      } else {
        const number = quoteNumber ?? (await getNextDocumentNumber(organization.id, "QUOTE"));
        await db.quote.create({
          data: {
            organizationId: organization.id,
            number,
            referenceNumber: r.referenceNumber || null,
            contactId: contact.id,
            status: "DRAFT",
            issueDate,
            expiryDate,
            subject: r.subject || null,
            currency: r.currency?.trim() || organization.currency,
            subTotal: total,
            total,
            customerNotes: r.customerNotes || null,
            lineItems: {
              create: [
                {
                  position: 0,
                  name: r.subject || "Imported quote",
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
    entityType: "QuoteImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/sales/quotes");
  return result;
}
