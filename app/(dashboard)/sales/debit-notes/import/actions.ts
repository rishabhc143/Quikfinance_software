"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

export type DupHandling = "skip" | "overwrite";

export type ImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

/**
 * M17f: Debit Notes import action. CSV columns:
 *   debitNoteNumber, referenceNumber, customerName, debitNoteDate,
 *   total, currency, reason, customerNotes
 *
 * Customer must exist (by displayName, case-insensitive). Skips rows
 * with no matching customer. New debit notes default to status=OPEN.
 */
const HEADER_ALIASES: Record<string, string> = {
  "debit note #": "debitNoteNumber",
  "debit note number": "debitNoteNumber",
  number: "debitNoteNumber",
  "reference #": "referenceNumber",
  "reference number": "referenceNumber",
  "customer name": "customerName",
  customer: "customerName",
  date: "debitNoteDate",
  "debit note date": "debitNoteDate",
  amount: "total",
  total: "total",
  currency: "currency",
  reason: "reason",
  notes: "customerNotes",
};

function normalizeHeader(h: string): string {
  return (HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim()).slice(0, 80);
}

export async function importDebitNotesAction(input: {
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

  let records: Record<string, string>[] = [];
  try {
    records = parse(input.csvText, {
      columns: (header: string[]) => header.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    result.errors.push({
      row: 0,
      message: e instanceof Error ? e.message : "Failed to parse CSV",
    });
    return result;
  }
  result.parsed = records.length;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const rowNum = i + 2; // CSV row including header
    try {
      const customerName = (r.customerName ?? "").trim();
      const total = Number(r.total ?? "0");
      if (!customerName) {
        result.errors.push({ row: rowNum, message: "Missing customerName" });
        continue;
      }
      if (!Number.isFinite(total) || total <= 0) {
        result.errors.push({ row: rowNum, message: "Invalid total" });
        continue;
      }

      const contact = await db.contact.findFirst({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          displayName: { equals: customerName, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (!contact) {
        result.errors.push({
          row: rowNum,
          message: `Customer "${customerName}" not found`,
        });
        continue;
      }

      const date = r.debitNoteDate ? new Date(r.debitNoteDate) : new Date();
      const number = (r.debitNoteNumber ?? "").trim() || `DN-${Date.now()}-${i}`;
      const existing = await db.debitNote.findFirst({
        where: { organizationId: organization.id, debitNoteNumber: number },
        select: { id: true },
      });

      if (existing) {
        if (input.dupHandling === "skip") {
          result.skipped += 1;
          continue;
        }
        await db.debitNote.update({
          where: { id: existing.id },
          data: {
            debitNoteDate: date,
            contactId: contact.id,
            referenceNumber: r.referenceNumber || null,
            total,
            subTotal: total,
            currency: r.currency || "INR",
            reason: r.reason || null,
            customerNotes: r.customerNotes || null,
          },
        });
        result.updated += 1;
      } else {
        await db.debitNote.create({
          data: {
            organizationId: organization.id,
            debitNoteNumber: number,
            referenceNumber: r.referenceNumber || null,
            contactId: contact.id,
            debitNoteDate: date,
            total,
            subTotal: total,
            currency: r.currency || "INR",
            reason: r.reason || null,
            customerNotes: r.customerNotes || null,
            status: "OPEN",
          },
        });
        result.created += 1;
      }
    } catch (e) {
      result.errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Row failed",
      });
    }
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "DebitNoteImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/sales/debit-notes");
  return result;
}
