"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocument } from "@/lib/sales/totals";
import {
  makeHeaderNormalizer,
  parseImportDate,
} from "@/lib/purchases/import-helpers";

/**
 * Vendor Credit CSV-import server action.
 *
 * Differences from Bills import:
 *   - Number is AUTO-generated via `getNextDocumentNumber(...,
 *     "VENDOR_CREDIT")` so the CSV's number column (if any) is
 *     ignored. Prefix is CN- per <vendor_credits_spec>.
 *   - Dedup is by `(orgId, contactId, referenceNumber)`. When
 *     referenceNumber is blank, ALL rows are treated as new (no
 *     skip / overwrite path possible — the user has no shared key).
 *   - Created credits land as DRAFT so the user marks them Open
 *     before they can be applied to bills.
 *
 * Like Bills import, CSV is flat → one primary line per row.
 */

export type VCDupHandling = "skip" | "overwrite" | "add_as_new";

export type VCImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const HEADER_ALIASES: Record<string, string> = {
  // vendor lookup
  "vendor": "vendorName",
  "vendor name": "vendorName",
  "supplier": "vendorName",
  // identity
  "reference": "referenceNumber",
  "reference number": "referenceNumber",
  "reference #": "referenceNumber",
  "ref": "referenceNumber",
  "subject": "subject",
  "reason": "reason",
  // dates
  "date": "date",
  "credit date": "date",
  "issue date": "date",
  // money / tax
  "currency": "currency",
  "place of supply": "placeOfSupply",
  // notes
  "notes": "notes",
  // one line item per row
  "item": "lineName",
  "item name": "lineName",
  "line": "lineName",
  "line name": "lineName",
  "description": "lineDescription",
  "line description": "lineDescription",
  "quantity": "lineQuantity",
  "qty": "lineQuantity",
  "rate": "lineRate",
  "price": "lineRate",
  "amount": "lineRate",
  "account": "lineAccount",
  "account code": "lineAccount",
  "tax": "lineTaxName",
  "tax name": "lineTaxName",
};

const normalizeHeader = makeHeaderNormalizer(HEADER_ALIASES);
const parseDate = parseImportDate;

export async function importVendorCreditsAction(input: {
  csvText: string;
  dupHandling: VCDupHandling;
}): Promise<VCImportResult> {
  const { user, organization } = await requireOrganization();
  const result: VCImportResult = {
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
      errors: [
        { row: 0, message: `CSV parse failed: ${(err as Error).message}` },
      ],
    };
  }
  result.parsed = rows.length;

  // Preload lookups.
  const [vendors, accounts, taxes] = await Promise.all([
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        type: { in: ["VENDOR", "BOTH"] },
        deletedAt: null,
      },
      select: { id: true, displayName: true },
    }),
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true },
    }),
    db.tax.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, rate: true },
    }),
  ]);
  const vendorByName = new Map(
    vendors.map((v) => [v.displayName.toLowerCase(), v.id])
  );
  const accountByName = new Map<string, string>();
  for (const a of accounts) {
    accountByName.set(a.name.toLowerCase(), a.id);
    if (a.code) accountByName.set(a.code.toLowerCase(), a.id);
  }
  const taxByName = new Map(
    taxes.map((t) => [
      t.name.toLowerCase(),
      { id: t.id, rate: Number(t.rate) },
    ])
  );

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const rowNum = i + 2;

    const vendorName = (r.vendorName ?? "").trim();
    if (!vendorName) {
      result.errors.push({ row: rowNum, message: "vendor name missing" });
      continue;
    }
    const contactId = vendorByName.get(vendorName.toLowerCase());
    if (!contactId) {
      result.errors.push({
        row: rowNum,
        message: `vendor "${vendorName}" not found`,
      });
      continue;
    }
    const date = parseDate(r.date);
    if (!date) {
      result.errors.push({
        row: rowNum,
        message: "date missing or unrecognised",
      });
      continue;
    }
    const referenceNumber = r.referenceNumber?.trim() || null;

    const lineName =
      (r.lineName ?? "").trim() ||
      (r.subject ?? "").trim() ||
      (r.reason ?? "").trim() ||
      "Vendor credit";
    const lineQuantity = Number(r.lineQuantity ?? "1") || 1;
    const lineRate = Number(r.lineRate ?? "0") || 0;
    const lineAccountId = r.lineAccount
      ? accountByName.get(r.lineAccount.trim().toLowerCase()) ?? null
      : null;
    if (r.lineAccount && !lineAccountId) {
      result.errors.push({
        row: rowNum,
        message: `account "${r.lineAccount}" not found`,
      });
      continue;
    }
    const tax = r.lineTaxName
      ? taxByName.get(r.lineTaxName.trim().toLowerCase()) ?? null
      : null;
    if (r.lineTaxName && !tax) {
      result.errors.push({
        row: rowNum,
        message: `tax "${r.lineTaxName}" not found`,
      });
      continue;
    }

    const totals = computeDocument({
      lines: [
        {
          quantity: lineQuantity,
          rate: lineRate,
          taxRate: tax?.rate ?? 0,
        },
      ],
      adjustment: 0,
    });

    // Dedup against `(orgId, contactId, referenceNumber)` IF the ref
    // is set. Blank refs always create a new row.
    const existing = referenceNumber
      ? await db.vendorCredit.findFirst({
          where: {
            organizationId: organization.id,
            contactId,
            referenceNumber,
            deletedAt: null,
          },
          select: {
            id: true,
            status: true,
            amountApplied: true,
            amountRefunded: true,
          },
        })
      : null;

    try {
      if (existing) {
        if (input.dupHandling === "skip") {
          result.skipped += 1;
          continue;
        }
        if (input.dupHandling === "overwrite") {
          if (
            Number(existing.amountApplied) > 0 ||
            Number(existing.amountRefunded) > 0 ||
            existing.status === "VOID"
          ) {
            result.errors.push({
              row: rowNum,
              message: `credit for ref "${referenceNumber}" has applications/refunds or is void — can't overwrite`,
            });
            continue;
          }
          await db.$transaction(async (tx) => {
            await tx.vendorCreditLineItem.deleteMany({
              where: { vendorCreditId: existing.id },
            });
            await tx.vendorCredit.update({
              where: { id: existing.id },
              data: {
                date,
                subject: r.subject?.trim() || null,
                placeOfSupply: r.placeOfSupply?.trim() || null,
                currency: r.currency?.trim() || organization.currency,
                reason: r.reason?.trim() || null,
                notes: r.notes?.trim() || null,
                subTotal: totals.subTotal,
                taxAmount: totals.documentTaxAmount,
                total: totals.total,
                lineItems: {
                  create: [
                    {
                      itemId: null,
                      position: 0,
                      name: lineName,
                      description: r.lineDescription?.trim() || null,
                      hsnSacCode: null,
                      accountId: lineAccountId,
                      quantity: lineQuantity,
                      rate: lineRate,
                      taxId: tax?.id ?? null,
                      amount: totals.lines[0]?.amount ?? 0,
                    },
                  ],
                },
              },
            });
          });
          result.updated += 1;
          continue;
        }
        // add_as_new — fall through to create.
      }

      const number = await getNextDocumentNumber(
        organization.id,
        "VENDOR_CREDIT"
      );
      await db.vendorCredit.create({
        data: {
          organizationId: organization.id,
          number,
          referenceNumber,
          contactId,
          date,
          subject: r.subject?.trim() || null,
          status: "DRAFT",
          currency: r.currency?.trim() || organization.currency,
          subTotal: totals.subTotal,
          taxAmount: totals.documentTaxAmount,
          total: totals.total,
          placeOfSupply: r.placeOfSupply?.trim() || null,
          reason: r.reason?.trim() || null,
          notes: r.notes?.trim() || null,
          lineItems: {
            create: [
              {
                itemId: null,
                position: 0,
                name: lineName,
                description: r.lineDescription?.trim() || null,
                hsnSacCode: null,
                accountId: lineAccountId,
                quantity: lineQuantity,
                rate: lineRate,
                taxId: tax?.id ?? null,
                amount: totals.lines[0]?.amount ?? 0,
              },
            ],
          },
        },
      });
      result.created += 1;
    } catch (err) {
      result.errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "VendorCreditImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/purchases/vendor-credits");
  return result;
}
