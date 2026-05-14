"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  bucketsForFiscalYear,
  BUDGETABLE_ACCOUNT_TYPES,
  isBudgetPeriod,
  type BudgetPeriod,
} from "@/lib/accounting/budgets";

/**
 * ACCT-D.2 — Server actions for Budgets (Zoho-parity rebuild).
 *
 *   createBudgetAction         — writes the header + N×accounts
 *                                BudgetLine rows (N = 12/4/1 based
 *                                on budgetPeriod) inside one tx.
 *                                Amounts start at 0; the user enters
 *                                them on the detail-page grid.
 *   saveBudgetAmountsAction    — bulk-updates the BudgetLine.amount
 *                                cells for the detail-page editable
 *                                grid. Validates every cell against
 *                                the budget's actual lines so an
 *                                attacker can't write a row that
 *                                doesn't belong to the budget.
 *   deleteBudgetAction         — hard delete; FK cascade drops lines.
 */

const createSchema = z.object({
  name: z.string().min(1, "Name the budget.").max(160),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  budgetPeriod: z
    .string()
    .refine(isBudgetPeriod, "budgetPeriod must be MONTHLY | QUARTERLY | YEARLY"),
  accountIds: z
    .array(z.string().min(1))
    .min(1, "Pick at least one account."),
});

export type BudgetInput = z.input<typeof createSchema>;

// ──────────────────── create ────────────────────

export async function createBudgetAction(
  input: BudgetInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createSchema.parse(input);

  // De-dupe in case the form passed the same id twice.
  const accountIds = Array.from(new Set(data.accountIds));

  // Verify every account belongs to the org AND has a budget-able
  // type. Both protect against tampered payloads.
  const accounts = await db.chartOfAccount.findMany({
    where: { id: { in: accountIds }, organizationId: organization.id },
    select: { id: true, type: true },
  });
  if (accounts.length !== accountIds.length) {
    return { ok: false, error: "Some accounts not found in this org." };
  }
  const offType = accounts.filter(
    (a) =>
      !BUDGETABLE_ACCOUNT_TYPES.includes(
        a.type as (typeof BUDGETABLE_ACCOUNT_TYPES)[number]
      )
  );
  if (offType.length > 0) {
    return {
      ok: false,
      error:
        "Pick accounts only from Income / Expense / Asset / Liability / Equity.",
    };
  }

  const buckets = bucketsForFiscalYear(
    data.fiscalYear,
    organization.fiscalYearStart,
    data.budgetPeriod as BudgetPeriod
  );

  const created = await db.$transaction(async (tx) => {
    const header = await tx.budget.create({
      data: {
        organizationId: organization.id,
        name: data.name,
        fiscalYear: data.fiscalYear,
        budgetPeriod: data.budgetPeriod,
        status: "ACTIVE",
      },
    });

    // (account × bucket) rows, all amount = 0. User enters amounts
    // on the detail-page editable grid. 12 × N for monthly, 4 × N
    // for quarterly, 1 × N for yearly — bounded enough to stay
    // inside a single createMany regardless of N.
    const rows = accountIds.flatMap((accountId) =>
      buckets.map((b) => ({
        budgetId: header.id,
        accountId,
        periodStart: b.start,
        periodEnd: b.end,
        amount: 0,
      }))
    );
    if (rows.length > 0) {
      await tx.budgetLine.createMany({ data: rows });
    }
    return header;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Budget",
    entityId: created.id,
    after: {
      name: created.name,
      fiscalYear: created.fiscalYear,
      budgetPeriod: created.budgetPeriod,
      accounts: accountIds.length,
    },
  });

  revalidatePath("/accountant/budgets");
  return { ok: true, id: created.id };
}

export async function createBudgetAndRedirectAction(
  input: BudgetInput
): Promise<void> {
  const res = await createBudgetAction(input);
  if (!res.ok || !res.id) {
    throw new Error(res.error ?? "Failed to create budget");
  }
  redirect(`/accountant/budgets/${res.id}`);
}

// ──────────────────── save amounts (detail-page grid) ────────────────────

const cellSchema = z.object({
  accountId: z.string().min(1),
  /** Period bucket index. 0..11 for MONTHLY, 0..3 for QUARTERLY, 0 for YEARLY. */
  periodIndex: z.coerce.number().int().min(0).max(11),
  amount: z.coerce.number().nonnegative(),
});

const saveAmountsSchema = z.object({
  budgetId: z.string().min(1),
  cells: z.array(cellSchema),
});

export type SaveBudgetAmountsInput = z.input<typeof saveAmountsSchema>;

export async function saveBudgetAmountsAction(
  input: SaveBudgetAmountsInput
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = saveAmountsSchema.parse(input);

  const budget = await db.budget.findFirst({
    where: { id: data.budgetId, organizationId: organization.id },
    include: {
      lines: {
        select: { id: true, accountId: true, periodStart: true, amount: true },
        orderBy: [{ accountId: "asc" }, { periodStart: "asc" }],
      },
    },
  });
  if (!budget) return { ok: false, error: "Budget not found" };

  // Group lines by accountId → ordered list (matches the grid's
  // period-index axis). Filter out any cell whose (account, index)
  // doesn't match an existing BudgetLine — keeps the action safe
  // against tampered payloads.
  const byAccount = new Map<string, Array<{ id: string; amount: number }>>();
  for (const l of budget.lines) {
    const arr = byAccount.get(l.accountId) ?? [];
    arr.push({ id: l.id, amount: Number(l.amount) });
    byAccount.set(l.accountId, arr);
  }

  const updates: Array<{ id: string; amount: number }> = [];
  for (const c of data.cells) {
    const arr = byAccount.get(c.accountId);
    if (!arr) continue; // not on this budget
    const target = arr[c.periodIndex];
    if (!target) continue; // out-of-range cell — ignore
    // Skip no-op updates.
    if (target.amount === c.amount) continue;
    updates.push({ id: target.id, amount: c.amount });
  }

  if (updates.length === 0) {
    return { ok: true };
  }

  await db.$transaction(
    updates.map((u) =>
      db.budgetLine.update({
        where: { id: u.id },
        data: { amount: u.amount },
      })
    )
  );

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Budget",
    entityId: budget.id,
    after: { cellsUpdated: updates.length },
  });

  revalidatePath(`/accountant/budgets/${budget.id}`);
  revalidatePath("/accountant/budgets");
  return { ok: true };
}

// ──────────────────── delete ────────────────────

export async function deleteBudgetAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const row = await db.budget.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!row) return { ok: false, error: "Budget not found" };

  // FK cascade drops the lines for us.
  await db.budget.delete({ where: { id } });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Budget",
    entityId: id,
    before: { name: row.name, fiscalYear: row.fiscalYear },
  });

  revalidatePath("/accountant/budgets");
  return { ok: true };
}

export async function deleteBudgetByIdAction(id: string): Promise<void> {
  const res = await deleteBudgetAction(id);
  if (!res.ok) throw new Error(res.error ?? "Delete failed");
}
