"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  monthlyBucketsForYear,
  distributeAnnualEvenly,
  BUDGETABLE_ACCOUNT_TYPES,
} from "@/lib/accounting/budgets";

/**
 * ACCT-D — Server actions for Budgets.
 *
 *   createBudgetAction  — writes the header + 12×N BudgetLine rows
 *                          inside one transaction. Annual figure
 *                          is distributed evenly across months;
 *                          the last bucket absorbs the rounding
 *                          remainder so Σ buckets === annual.
 *   deleteBudgetAction  — hard delete; FK cascade drops the lines.
 */

const lineSchema = z.object({
  accountId: z.string().min(1, "Pick an account on every line."),
  annualAmount: z.coerce.number().nonnegative(),
});

const createSchema = z.object({
  name: z.string().min(1, "Name the budget.").max(160),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  lines: z.array(lineSchema).min(1, "Add at least one account."),
});

export type BudgetInput = z.input<typeof createSchema>;

// ──────────────────── create ────────────────────

export async function createBudgetAction(
  input: BudgetInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createSchema.parse(input);

  // Verify every account belongs to the org AND is a P&L account.
  const accountIds = Array.from(new Set(data.lines.map((l) => l.accountId)));
  const accounts = await db.chartOfAccount.findMany({
    where: { id: { in: accountIds }, organizationId: organization.id },
    select: { id: true, type: true },
  });
  if (accounts.length !== accountIds.length) {
    return { ok: false, error: "Some accounts not found in this org." };
  }
  const nonPnl = accounts.filter(
    (a) =>
      !BUDGETABLE_ACCOUNT_TYPES.includes(
        a.type as (typeof BUDGETABLE_ACCOUNT_TYPES)[number]
      )
  );
  if (nonPnl.length > 0) {
    return {
      ok: false,
      error: "Budgets can only target Income / Expense / COGS accounts.",
    };
  }

  // De-dupe: an account can appear only once per budget.
  if (accountIds.length !== data.lines.length) {
    return { ok: false, error: "Each account can only appear once." };
  }

  const buckets = monthlyBucketsForYear(
    data.fiscalYear,
    organization.fiscalYearStart
  );

  const created = await db.$transaction(async (tx) => {
    const header = await tx.budget.create({
      data: {
        organizationId: organization.id,
        name: data.name,
        fiscalYear: data.fiscalYear,
        status: "ACTIVE",
      },
    });

    // 12 × N rows; we use createMany so a 20-account budget is still
    // one round-trip.
    const rows = data.lines.flatMap((l) => {
      const monthly = distributeAnnualEvenly(Number(l.annualAmount ?? 0));
      return monthly.map((amount, i) => ({
        budgetId: header.id,
        accountId: l.accountId,
        periodStart: buckets[i].start,
        periodEnd: buckets[i].end,
        amount,
      }));
    });
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
      accounts: data.lines.length,
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
