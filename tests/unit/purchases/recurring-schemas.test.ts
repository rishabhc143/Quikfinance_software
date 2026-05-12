import { describe, it, expect } from "vitest";
import { recurringBillSchema } from "@/lib/validations/recurring-bill";
import { recurringExpenseSchema } from "@/lib/validations/recurring-expense";

/**
 * Tests for the Recurring Bill / Recurring Expense zod schemas.
 *
 * Per <recurring_bills_spec> / <recurring_expenses_spec> a key
 * invariant is the end-date OR neverExpires constraint — the cron
 * needs an upper bound (or an explicit "no upper bound") so it
 * doesn't loop forever.
 */

function baseRecurringBill(over: Partial<Record<string, unknown>> = {}) {
  return {
    profileName: "Monthly office rent",
    contactId: "vendor-1",
    frequency: "monthly" as const,
    intervalN: 1,
    startDate: "2026-05-10",
    neverExpires: true,
    lines: [{ name: "Rent", quantity: 1, rate: 50000 }],
    ...over,
  };
}

function baseRecurringExpense(over: Partial<Record<string, unknown>> = {}) {
  return {
    profileName: "Weekly snacks",
    expenseAccountId: "acct-snacks",
    paidThroughAccountId: "acct-cash",
    frequency: "weekly" as const,
    intervalN: 1,
    startDate: "2026-05-10",
    neverExpires: true,
    amount: 500,
    ...over,
  };
}

describe("recurringBillSchema — happy path", () => {
  it("accepts a minimal profile", () => {
    const r = recurringBillSchema.safeParse(baseRecurringBill());
    expect(r.success).toBe(true);
  });
  it("defaults status to ACTIVE", () => {
    const r = recurringBillSchema.safeParse(baseRecurringBill());
    if (!r.success) throw new Error("Expected success");
    expect(r.data.status).toBe("ACTIVE");
  });
  it("accepts a profile with explicit end date", () => {
    const r = recurringBillSchema.safeParse(
      baseRecurringBill({
        neverExpires: false,
        endDate: "2027-05-10",
      })
    );
    expect(r.success).toBe(true);
  });
  it("accepts multiple lines + billable customer", () => {
    const r = recurringBillSchema.safeParse(
      baseRecurringBill({
        lines: [
          { name: "Rent", quantity: 1, rate: 50000 },
          {
            name: "Utilities reimbursable",
            quantity: 1,
            rate: 2000,
            billableToCustomerId: "cust-acme",
          },
        ],
      })
    );
    expect(r.success).toBe(true);
  });
});

describe("recurringBillSchema — rejections", () => {
  it("rejects empty profileName", () => {
    const r = recurringBillSchema.safeParse(
      baseRecurringBill({ profileName: "" })
    );
    expect(r.success).toBe(false);
  });
  it("rejects missing vendor", () => {
    const r = recurringBillSchema.safeParse(
      baseRecurringBill({ contactId: "" })
    );
    expect(r.success).toBe(false);
  });
  it("rejects empty lines", () => {
    const r = recurringBillSchema.safeParse(
      baseRecurringBill({ lines: [] })
    );
    expect(r.success).toBe(false);
  });
  it("rejects when neverExpires=false AND endDate is null", () => {
    const r = recurringBillSchema.safeParse(
      baseRecurringBill({ neverExpires: false, endDate: null })
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message.match(/end date/i))
      ).toBe(true);
    }
  });
  it("rejects unknown frequency", () => {
    const r = recurringBillSchema.safeParse(
      baseRecurringBill({
        frequency: "fortnightly" as unknown as "weekly",
      })
    );
    expect(r.success).toBe(false);
  });
});

describe("recurringExpenseSchema — happy path", () => {
  it("accepts a minimal profile", () => {
    const r = recurringExpenseSchema.safeParse(baseRecurringExpense());
    expect(r.success).toBe(true);
  });
  it("defaults isBillable=false when no customerId", () => {
    const r = recurringExpenseSchema.safeParse(baseRecurringExpense());
    if (!r.success) throw new Error("Expected success");
    expect(r.data.isBillable).toBe(false);
  });
  it("accepts a billable profile with customerId + isBillable", () => {
    const r = recurringExpenseSchema.safeParse(
      baseRecurringExpense({
        customerId: "cust-acme",
        isBillable: true,
      })
    );
    expect(r.success).toBe(true);
  });
});

describe("recurringExpenseSchema — rejections", () => {
  it("rejects zero amount", () => {
    const r = recurringExpenseSchema.safeParse(
      baseRecurringExpense({ amount: 0 })
    );
    expect(r.success).toBe(false);
  });
  it("rejects missing expenseAccountId", () => {
    const r = recurringExpenseSchema.safeParse(
      baseRecurringExpense({ expenseAccountId: "" })
    );
    expect(r.success).toBe(false);
  });
  it("rejects missing paidThroughAccountId", () => {
    const r = recurringExpenseSchema.safeParse(
      baseRecurringExpense({ paidThroughAccountId: "" })
    );
    expect(r.success).toBe(false);
  });
  it("rejects neverExpires=false without endDate", () => {
    const r = recurringExpenseSchema.safeParse(
      baseRecurringExpense({ neverExpires: false, endDate: null })
    );
    expect(r.success).toBe(false);
  });
  it("rejects customerId set without isBillable=true", () => {
    const r = recurringExpenseSchema.safeParse(
      baseRecurringExpense({
        customerId: "cust-acme",
        isBillable: false,
      })
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message.match(/billable/i))
      ).toBe(true);
    }
  });
});
