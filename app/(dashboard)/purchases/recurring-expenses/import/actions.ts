"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { RECURRING_EXPENSE_FREQUENCIES } from "@/lib/validations/recurring-expense";
import {
  makeHeaderNormalizer,
  parseImportBool,
  parseImportDate,
} from "@/lib/purchases/import-helpers";

/**
 * Recurring Expense CSV-import server action.
 *
 * No line items — single amount per row. Dedup is by `(orgId,
 * profileName)`. When `customer_name` is set, `isBillable` auto-flips
 * true (matches the form's cross-field invariant) so the generated
 * Expense rows surface on the customer's next Invoice via the
 * BillableExpensesPanel.
 */

export type REDupHandling = "skip" | "overwrite" | "add_as_new";

export type REImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const HEADER_ALIASES: Record<string, string> = {
  "profile name": "profileName",
  "name": "profileName",
  "profile": "profileName",
  "category": "category",
  "vendor": "vendorName",
  "vendor name": "vendorName",
  "supplier": "vendorName",
  "customer": "customerName",
  "customer name": "customerName",
  "billable to": "customerName",
  "billable customer": "customerName",
  "is billable": "isBillable",
  "billable": "isBillable",
  "expense account": "expenseAccount",
  "account": "expenseAccount",
  "paid through": "paidThroughAccount",
  "paid through account": "paidThroughAccount",
  "bank": "paidThroughAccount",
  "frequency": "frequency",
  "interval": "intervalN",
  "interval n": "intervalN",
  "every": "intervalN",
  "start date": "startDate",
  "start": "startDate",
  "end date": "endDate",
  "end": "endDate",
  "never expires": "neverExpires",
  "amount": "amount",
  "notes": "notes",
};

const normalizeHeader = makeHeaderNormalizer(HEADER_ALIASES);
const parseDate = parseImportDate;
const parseBool = parseImportBool;

export async function importRecurringExpensesAction(input: {
  csvText: string;
  dupHandling: REDupHandling;
}): Promise<REImportResult> {
  const { user, organization } = await requireOrganization();
  const result: REImportResult = {
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

  const [vendors, customers, accounts] = await Promise.all([
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        type: { in: ["VENDOR", "BOTH"] },
        deletedAt: null,
      },
      select: { id: true, displayName: true },
    }),
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        type: { in: ["CUSTOMER", "BOTH"] },
        deletedAt: null,
      },
      select: { id: true, displayName: true },
    }),
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true, type: true },
    }),
  ]);
  const vendorByName = new Map(
    vendors.map((v) => [v.displayName.toLowerCase(), v.id])
  );
  const customerByName = new Map(
    customers.map((c) => [c.displayName.toLowerCase(), c.id])
  );
  const accountByName = new Map<string, { id: string; type: string }>();
  for (const a of accounts) {
    accountByName.set(a.name.toLowerCase(), { id: a.id, type: a.type });
    if (a.code)
      accountByName.set(a.code.toLowerCase(), { id: a.id, type: a.type });
  }

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const rowNum = i + 2;

    const profileName = (r.profileName ?? "").trim();
    if (!profileName) {
      result.errors.push({ row: rowNum, message: "profile name missing" });
      continue;
    }

    const expenseAccount = (r.expenseAccount ?? "").trim();
    if (!expenseAccount) {
      result.errors.push({
        row: rowNum,
        message: "expense account missing",
      });
      continue;
    }
    const expenseAcc = accountByName.get(expenseAccount.toLowerCase());
    if (!expenseAcc) {
      result.errors.push({
        row: rowNum,
        message: `expense account "${expenseAccount}" not found`,
      });
      continue;
    }
    const paidThroughAccount = (r.paidThroughAccount ?? "").trim();
    if (!paidThroughAccount) {
      result.errors.push({
        row: rowNum,
        message: "paid through account missing",
      });
      continue;
    }
    const paidThroughAcc = accountByName.get(paidThroughAccount.toLowerCase());
    if (!paidThroughAcc) {
      result.errors.push({
        row: rowNum,
        message: `paid through account "${paidThroughAccount}" not found`,
      });
      continue;
    }

    const freqRaw = (r.frequency ?? "monthly").trim().toLowerCase();
    if (
      !RECURRING_EXPENSE_FREQUENCIES.includes(
        freqRaw as (typeof RECURRING_EXPENSE_FREQUENCIES)[number]
      )
    ) {
      result.errors.push({
        row: rowNum,
        message: `frequency "${freqRaw}" must be one of ${RECURRING_EXPENSE_FREQUENCIES.join(", ")}`,
      });
      continue;
    }
    const frequency =
      freqRaw as (typeof RECURRING_EXPENSE_FREQUENCIES)[number];

    const intervalN = Math.max(1, Number(r.intervalN ?? "1") || 1);
    const startDate = parseDate(r.startDate);
    if (!startDate) {
      result.errors.push({
        row: rowNum,
        message: "start date missing or unrecognised",
      });
      continue;
    }
    const endDate = parseDate(r.endDate);
    const neverExpiresFlag = parseBool(r.neverExpires);
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

    const amount = Number(r.amount ?? "0");
    if (!amount || amount <= 0) {
      result.errors.push({
        row: rowNum,
        message: "amount must be positive",
      });
      continue;
    }

    // Optional vendor + customer lookups
    const contactId = r.vendorName?.trim()
      ? vendorByName.get(r.vendorName.trim().toLowerCase()) ?? null
      : null;
    if (r.vendorName && !contactId) {
      result.errors.push({
        row: rowNum,
        message: `vendor "${r.vendorName}" not found`,
      });
      continue;
    }
    const customerId = r.customerName?.trim()
      ? customerByName.get(r.customerName.trim().toLowerCase()) ?? null
      : null;
    if (r.customerName && !customerId) {
      result.errors.push({
        row: rowNum,
        message: `customer "${r.customerName}" not found`,
      });
      continue;
    }
    // Auto-flip isBillable when a customer is set — mirrors the form's
    // cross-field invariant in `recurringExpenseSchema`.
    const isBillable =
      customerId !== null
        ? true
        : parseBool(r.isBillable) === true
        ? true
        : false;

    const existing = await db.recurringExpense.findFirst({
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
          await db.recurringExpense.update({
            where: { id: existing.id },
            data: {
              category: r.category?.trim() || null,
              contactId,
              customerId,
              isBillable,
              expenseAccountId: expenseAcc.id,
              paidThroughAccountId: paidThroughAcc.id,
              frequency,
              intervalN,
              startDate,
              endDate: neverExpires ? null : endDate,
              neverExpires,
              amount,
              notes: r.notes?.trim() || null,
            },
          });
          result.updated += 1;
          continue;
        }
        // add_as_new — suffix the profile name.
        const stamped = `${profileName} (${Date.now().toString().slice(-4)})`;
        await db.recurringExpense.create({
          data: {
            organizationId: organization.id,
            profileName: stamped,
            category: r.category?.trim() || null,
            contactId,
            customerId,
            isBillable,
            expenseAccountId: expenseAcc.id,
            paidThroughAccountId: paidThroughAcc.id,
            frequency,
            intervalN,
            startDate,
            endDate: neverExpires ? null : endDate,
            neverExpires,
            nextRunAt: startDate,
            nextOccurrenceDate: startDate,
            status: "ACTIVE",
            isActive: true,
            amount,
            notes: r.notes?.trim() || null,
          },
        });
        result.created += 1;
        continue;
      }

      await db.recurringExpense.create({
        data: {
          organizationId: organization.id,
          profileName,
          category: r.category?.trim() || null,
          contactId,
          customerId,
          isBillable,
          expenseAccountId: expenseAcc.id,
          paidThroughAccountId: paidThroughAcc.id,
          frequency,
          intervalN,
          startDate,
          endDate: neverExpires ? null : endDate,
          neverExpires,
          nextRunAt: startDate,
          nextOccurrenceDate: startDate,
          status: "ACTIVE",
          isActive: true,
          amount,
          notes: r.notes?.trim() || null,
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
    entityType: "RecurringExpenseImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/purchases/recurring-expenses");
  return result;
}
