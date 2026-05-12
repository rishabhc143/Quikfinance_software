"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { computeDocument } from "@/lib/sales/totals";
import { RECURRING_BILL_FREQUENCIES } from "@/lib/validations/recurring-bill";
import {
  makeHeaderNormalizer,
  parseImportBool,
  parseImportDate,
} from "@/lib/purchases/import-helpers";

/**
 * Recurring Bill CSV-import server action.
 *
 * Dedup key is `(orgId, profileName)`. Each CSV row creates one
 * profile with one primary line; the cron unpacks `templateJson`
 * into BillLineItem rows on each run. Profiles are created in the
 * status from the CSV (default ACTIVE) so they start generating on
 * the next cron tick.
 */

export type RBDupHandling = "skip" | "overwrite" | "add_as_new";

export type RBImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const HEADER_ALIASES: Record<string, string> = {
  // identity
  "profile name": "profileName",
  "name": "profileName",
  "profile": "profileName",
  // vendor
  "vendor": "vendorName",
  "vendor name": "vendorName",
  "supplier": "vendorName",
  // schedule
  "frequency": "frequency",
  "interval": "intervalN",
  "interval n": "intervalN",
  "every": "intervalN",
  "start date": "startDate",
  "start": "startDate",
  "end date": "endDate",
  "end": "endDate",
  "never expires": "neverExpires",
  // misc
  "reference": "referenceNumber",
  "reference number": "referenceNumber",
  "currency": "currency",
  "place of supply": "placeOfSupply",
  "notes": "notes",
  // line (single per row)
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
const parseBool = parseImportBool;

export async function importRecurringBillsAction(input: {
  csvText: string;
  dupHandling: RBDupHandling;
}): Promise<RBImportResult> {
  const { user, organization } = await requireOrganization();
  const result: RBImportResult = {
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

    const profileName = (r.profileName ?? "").trim();
    if (!profileName) {
      result.errors.push({ row: rowNum, message: "profile name missing" });
      continue;
    }
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
    const freqRaw = (r.frequency ?? "monthly").trim().toLowerCase();
    if (
      !RECURRING_BILL_FREQUENCIES.includes(
        freqRaw as (typeof RECURRING_BILL_FREQUENCIES)[number]
      )
    ) {
      result.errors.push({
        row: rowNum,
        message: `frequency "${freqRaw}" must be one of ${RECURRING_BILL_FREQUENCIES.join(", ")}`,
      });
      continue;
    }
    const frequency = freqRaw as (typeof RECURRING_BILL_FREQUENCIES)[number];

    const intervalN = Math.max(1, Number(r.intervalN ?? "1") || 1);
    const startDate = parseDate(r.startDate);
    if (!startDate) {
      result.errors.push({
        row: rowNum,
        message: "start date missing or unrecognised",
      });
      continue;
    }
    const neverExpiresFlag = parseBool(r.neverExpires);
    const endDate = parseDate(r.endDate);
    // If end is not given AND neverExpires not explicitly false → treat
    // as never-expires.
    const neverExpires =
      neverExpiresFlag === false
        ? false
        : neverExpiresFlag === true
        ? true
        : !endDate;
    if (!neverExpires && !endDate) {
      result.errors.push({
        row: rowNum,
        message: "end date required when never_expires=false",
      });
      continue;
    }

    // Line resolution
    const lineName = (r.lineName ?? "").trim() || profileName;
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

    const templateJson = {
      referenceNumber: r.referenceNumber?.trim() || null,
      paymentTermsId: null,
      placeOfSupply: r.placeOfSupply?.trim() || null,
      currency: r.currency?.trim() || organization.currency,
      subtotal: Number(totals.subTotal),
      discountValue: 0,
      discountType: "percentage",
      taxId: null,
      taxTotal: Number(totals.documentTaxAmount),
      adjustmentLabel: "Adjustment",
      adjustmentValue: 0,
      total: Number(totals.total),
      termsAndConditions: null,
      lines: [
        {
          itemId: null,
          position: 0,
          name: lineName,
          description: r.lineDescription?.trim() || null,
          hsnSacCode: null,
          accountId: lineAccountId,
          billableToCustomerId: billableCustomerId,
          quantity: lineQuantity,
          rate: lineRate,
          taxId: tax?.id ?? null,
          amount: Number(totals.lines[0]?.amount ?? 0),
        },
      ],
    };

    const existing = await db.recurringBill.findFirst({
      where: {
        organizationId: organization.id,
        profileName,
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
            existing.status === "STOPPED" ||
            existing.status === "EXPIRED"
          ) {
            result.errors.push({
              row: rowNum,
              message: `profile "${profileName}" is ${existing.status.toLowerCase()} — can't overwrite`,
            });
            continue;
          }
          await db.recurringBill.update({
            where: { id: existing.id },
            data: {
              contactId,
              frequency,
              intervalN,
              startDate,
              endDate: neverExpires ? null : endDate,
              neverExpires,
              amount: Number(totals.total),
              templateJson,
            },
          });
          result.updated += 1;
          continue;
        }
        // add_as_new — append a numeric suffix.
        const stamped = `${profileName} (${Date.now().toString().slice(-4)})`;
        await db.recurringBill.create({
          data: {
            organizationId: organization.id,
            profileName: stamped,
            contactId,
            frequency,
            intervalN,
            startDate,
            endDate: neverExpires ? null : endDate,
            neverExpires,
            nextRunAt: startDate,
            nextOccurrenceDate: startDate,
            status: "ACTIVE",
            isActive: true,
            amount: Number(totals.total),
            templateJson,
          },
        });
        result.created += 1;
        continue;
      }

      await db.recurringBill.create({
        data: {
          organizationId: organization.id,
          profileName,
          contactId,
          frequency,
          intervalN,
          startDate,
          endDate: neverExpires ? null : endDate,
          neverExpires,
          nextRunAt: startDate,
          nextOccurrenceDate: startDate,
          status: "ACTIVE",
          isActive: true,
          amount: Number(totals.total),
          templateJson,
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
    entityType: "RecurringBillImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/purchases/recurring-bills");
  return result;
}
