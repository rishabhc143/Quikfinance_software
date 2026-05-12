"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { computeDocument } from "@/lib/sales/totals";
import {
  makeHeaderNormalizer,
  parseImportDate,
} from "@/lib/purchases/import-helpers";

/**
 * Bill CSV-import server action.
 *
 * Mirrors `vendors/import/actions.ts` but writes Bill + BillLineItem
 * rows. Per the plan, CSV is flat → one primary line per row. Users
 * who need multi-line bills can add the extra lines on the bill's
 * detail page after import.
 *
 * Dedup is by `(orgId, contactId, number)`. Per <bills_spec> bill
 * numbers are SOFT-unique (PR #101 dropped the constraint) — so this
 * action treats matches as "user chooses what to do" (skip / overwrite /
 * add_as_new). Created bills land as DRAFT so the user can review
 * before marking Open via bulk action or detail-page button.
 */

export type BillDupHandling = "skip" | "overwrite" | "add_as_new";

export type BillImportResult = {
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
  "supplier name": "vendorName",
  // bill identity
  "bill number": "number",
  "bill #": "number",
  "bill no": "number",
  "number": "number",
  "reference": "referenceNumber",
  "reference number": "referenceNumber",
  "reference #": "referenceNumber",
  "ref": "referenceNumber",
  "subject": "subject",
  // dates
  "issue date": "issueDate",
  "bill date": "issueDate",
  "date": "issueDate",
  "due date": "dueDate",
  // money / tax
  "currency": "currency",
  "place of supply": "placeOfSupply",
  // notes
  "notes": "notes",
  "terms": "termsAndConditions",
  "terms and conditions": "termsAndConditions",
  // one line item (per CSV row)
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
  "billable to": "lineBillableCustomer",
  "billable customer": "lineBillableCustomer",
};

const normalizeHeader = makeHeaderNormalizer(HEADER_ALIASES);
const parseDate = parseImportDate;

export async function importBillsAction(input: {
  csvText: string;
  dupHandling: BillDupHandling;
}): Promise<BillImportResult> {
  const { user, organization } = await requireOrganization();
  const result: BillImportResult = {
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

  // Preload lookup tables once — vendor / account / tax / customer
  // resolution is by name match (case-insensitive). Single batched
  // read keeps per-row work O(1).
  const [vendors, accounts, taxes, customers] = await Promise.all([
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
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        type: { in: ["CUSTOMER", "BOTH"] },
        deletedAt: null,
      },
      select: { id: true, displayName: true },
    }),
  ]);

  const vendorByName = new Map(
    vendors.map((v) => [v.displayName.toLowerCase(), v.id])
  );
  const customerByName = new Map(
    customers.map((c) => [c.displayName.toLowerCase(), c.id])
  );
  const accountById = new Map<string, { rate: number }>();
  const accountByName = new Map<string, string>();
  for (const a of accounts) {
    accountByName.set(a.name.toLowerCase(), a.id);
    if (a.code) accountByName.set(a.code.toLowerCase(), a.id);
  }
  const taxByName = new Map(
    taxes.map((t) => [t.name.toLowerCase(), { id: t.id, rate: Number(t.rate) }])
  );
  // unused but reserved for future
  void accountById;

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const rowNum = i + 2; // header is row 1

    const vendorName = (r.vendorName ?? "").trim();
    const number = (r.number ?? "").trim();
    if (!vendorName) {
      result.errors.push({ row: rowNum, message: "vendor name missing" });
      continue;
    }
    if (!number) {
      result.errors.push({ row: rowNum, message: "bill number missing" });
      continue;
    }
    const contactId = vendorByName.get(vendorName.toLowerCase());
    if (!contactId) {
      result.errors.push({
        row: rowNum,
        message: `vendor "${vendorName}" not found — create it first or fix the spelling`,
      });
      continue;
    }
    const issueDate = parseDate(r.issueDate);
    if (!issueDate) {
      result.errors.push({
        row: rowNum,
        message: "issue date missing or unrecognised",
      });
      continue;
    }
    // Default dueDate = issueDate + 30 days if not given
    const dueDate =
      parseDate(r.dueDate) ?? new Date(issueDate.getTime() + 30 * 86400000);

    // Line resolution
    const lineName =
      (r.lineName ?? "").trim() || (r.subject ?? "").trim() || number;
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
    const billableCustomerId = r.lineBillableCustomer
      ? customerByName.get(r.lineBillableCustomer.trim().toLowerCase()) ?? null
      : null;
    if (r.lineBillableCustomer && !billableCustomerId) {
      result.errors.push({
        row: rowNum,
        message: `billable customer "${r.lineBillableCustomer}" not found`,
      });
      continue;
    }

    // Totals — reuse the same primitive the form uses.
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

    // Dedup against `(orgId, contactId, number)`.
    const existing = await db.bill.findFirst({
      where: {
        organizationId: organization.id,
        contactId,
        number,
        deletedAt: null,
      },
      select: { id: true, status: true },
    });

    try {
      if (existing) {
        if (input.dupHandling === "skip") {
          result.skipped += 1;
          continue;
        }
        if (input.dupHandling === "overwrite") {
          if (
            existing.status === "PAID" ||
            existing.status === "WRITTEN_OFF"
          ) {
            result.errors.push({
              row: rowNum,
              message: `bill "${number}" is ${existing.status.toLowerCase()} — can't overwrite`,
            });
            continue;
          }
          await db.$transaction(async (tx) => {
            await tx.billLineItem.deleteMany({
              where: { billId: existing.id },
            });
            await tx.bill.update({
              where: { id: existing.id },
              data: {
                referenceNumber: r.referenceNumber?.trim() || null,
                subject: r.subject?.trim() || null,
                issueDate,
                dueDate,
                placeOfSupply: r.placeOfSupply?.trim() || null,
                currency: r.currency?.trim() || organization.currency,
                notes: r.notes?.trim() || null,
                termsAndConditions:
                  r.termsAndConditions?.trim() || null,
                subtotal: totals.subTotal,
                taxTotal: totals.documentTaxAmount,
                total: totals.total,
                lineItems: {
                  create: [
                    {
                      itemId: null,
                      position: 0,
                      name: lineName,
                      description: r.lineDescription?.trim() || "",
                      hsnSacCode: null,
                      accountId: lineAccountId,
                      billableToCustomerId: billableCustomerId,
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
        // add_as_new — suffix the bill number so the (vendor, number)
        // key shifts.
        const stamped = `${number}-${Date.now().toString().slice(-4)}`;
        await db.bill.create({
          data: {
            organizationId: organization.id,
            number: stamped,
            referenceNumber: r.referenceNumber?.trim() || null,
            subject: r.subject?.trim() || null,
            contactId,
            status: "DRAFT",
            issueDate,
            dueDate,
            placeOfSupply: r.placeOfSupply?.trim() || null,
            currency: r.currency?.trim() || organization.currency,
            notes: r.notes?.trim() || null,
            termsAndConditions: r.termsAndConditions?.trim() || null,
            subtotal: totals.subTotal,
            taxTotal: totals.documentTaxAmount,
            total: totals.total,
            lineItems: {
              create: [
                {
                  itemId: null,
                  position: 0,
                  name: lineName,
                  description: r.lineDescription?.trim() || "",
                  hsnSacCode: null,
                  accountId: lineAccountId,
                  billableToCustomerId: billableCustomerId,
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
        continue;
      }

      // No existing match — fresh DRAFT bill.
      await db.bill.create({
        data: {
          organizationId: organization.id,
          number,
          referenceNumber: r.referenceNumber?.trim() || null,
          subject: r.subject?.trim() || null,
          contactId,
          status: "DRAFT",
          issueDate,
          dueDate,
          placeOfSupply: r.placeOfSupply?.trim() || null,
          currency: r.currency?.trim() || organization.currency,
          notes: r.notes?.trim() || null,
          termsAndConditions: r.termsAndConditions?.trim() || null,
          subtotal: totals.subTotal,
          taxTotal: totals.documentTaxAmount,
          total: totals.total,
          lineItems: {
            create: [
              {
                itemId: null,
                position: 0,
                name: lineName,
                description: r.lineDescription?.trim() || "",
                hsnSacCode: null,
                accountId: lineAccountId,
                billableToCustomerId: billableCustomerId,
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
    entityType: "BillImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/purchases/bills");
  return result;
}
