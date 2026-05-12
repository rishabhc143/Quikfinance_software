import { z } from "zod";

/**
 * Purchases — RecurringExpense zod schemas per <recurring_expenses_spec>.
 *
 * Intentionally simpler than Recurring Bill: NO line items, just a
 * single expense-account + amount + paid-through. The mark-as-billable
 * flow piggybacks on the existing customerId field — when set, the
 * generated Expense row carries isBillable=true so the customer's
 * next invoice's <BillableExpensesPanel> picks it up.
 */

export const RECURRING_EXPENSE_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type RecurringExpenseFrequency =
  (typeof RECURRING_EXPENSE_FREQUENCIES)[number];

export const RECURRING_EXPENSE_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "EXPIRED",
  "STOPPED",
] as const;

export const recurringExpenseSchema = z
  .object({
    profileName: z.string().min(1, "Profile name required").max(120),
    category: z.string().max(80).nullable().optional(),
    contactId: z.string().nullable().optional(), // optional vendor
    customerId: z.string().nullable().optional(), // setting this makes it BILLABLE
    isBillable: z.boolean().default(false),
    expenseAccountId: z.string().min(1, "Expense account required"),
    paidThroughAccountId: z.string().min(1, "Paid Through account required"),
    frequency: z.enum(RECURRING_EXPENSE_FREQUENCIES),
    intervalN: z.coerce.number().int().min(1).default(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    neverExpires: z.boolean().default(true),
    amount: z.coerce.number().positive("Amount must be positive"),
    notes: z.string().max(500).nullable().optional(),
    status: z.enum(RECURRING_EXPENSE_STATUSES).default("ACTIVE"),
  })
  .refine(
    (v) => v.neverExpires || (v.endDate !== null && v.endDate !== undefined),
    {
      message: "Either set an end date or check 'Never expires'",
      path: ["endDate"],
    }
  )
  // When customerId is set, isBillable must be true (the form should
  // toggle this automatically). The cron's generator reads isBillable
  // to decide whether to mark the Expense row billable.
  .refine(
    (v) => !v.customerId || v.isBillable,
    {
      message: "Customer is set — mark as billable",
      path: ["isBillable"],
    }
  );

export type RecurringExpenseInput = z.input<typeof recurringExpenseSchema>;
