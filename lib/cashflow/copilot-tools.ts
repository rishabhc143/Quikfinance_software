import "server-only";

/**
 * CF-5 — Tool definitions for the CFO Copilot.
 *
 * Each tool here is a thin, read-only wrapper around Prisma / the
 * forecast engine. The Anthropic Messages API receives the tool
 * schemas; when Claude calls a tool, we route to `runTool()` which
 * dispatches to the implementations below.
 *
 * Design rules:
 *   • Read-only. v1 cannot mutate. Write actions (e.g., "send
 *     reminder to overdue customers") land in v2 after we work out
 *     the approval / audit-log story.
 *   • Tightly scoped — each tool answers one clear question. Claude
 *     composes them as needed.
 *   • All results are scoped to `organizationId`. The route layer
 *     resolves the org once via `requireOrganization` and passes it
 *     into every tool — no tool reads org from headers or context.
 *   • Money fields are numbers, dates are ISO strings — Claude is
 *     better at reasoning over those than Decimal / Date objects.
 */

import { format } from "date-fns";
import { db } from "@/lib/db";
import { computeForecast } from "./forecast";

export type CopilotToolName =
  | "get_cashflow_summary"
  | "get_weekly_breakdown"
  | "get_overdue_invoices"
  | "get_upcoming_bills"
  | "get_top_customers_by_ar"
  | "get_recurring_profiles";

/** Tool schemas Anthropic receives. Order doesn't matter; Claude
 *  picks based on the descriptions. */
export const COPILOT_TOOLS = [
  {
    name: "get_cashflow_summary",
    description:
      "Returns the high-level 12-week cashflow forecast for this organization: starting balance, projected ending balance, total inflows and outflows, minimum running balance and the date it occurs, weeks with negative cashflow, and insolvency risk flag. Use this when the user asks about overall cash position, runway, or whether they're at risk. Optional `stressDays` (0/7/14/30) adds a 'collections slip by N days' scenario layer.",
    input_schema: {
      type: "object" as const,
      properties: {
        stressDays: {
          type: "number",
          description:
            "Optional stress-test offset in days. 0 = base case. 7/14/30 = stress scenarios. Defaults to 0.",
          enum: [0, 7, 14, 30],
        },
      },
    },
  },
  {
    name: "get_weekly_breakdown",
    description:
      "Returns the 12 weekly buckets of the forecast: per-week inflows, outflows, net cashflow, ending balance, and minimum balance. Use this when the user asks 'when will I be in deficit?' or 'which week is worst?' or wants a week-by-week view.",
    input_schema: {
      type: "object" as const,
      properties: {
        stressDays: {
          type: "number",
          enum: [0, 7, 14, 30],
        },
      },
    },
  },
  {
    name: "get_overdue_invoices",
    description:
      "Returns the customer invoices that are past due and not fully paid. Each result includes invoice number, customer name, due date, total amount, amount still outstanding, and days past due. Use this when the user asks about collections, who owes them money, or 'who should I chase?'",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max rows to return (default 10, max 50).",
        },
      },
    },
  },
  {
    name: "get_upcoming_bills",
    description:
      "Returns vendor bills due within the next N days that aren't fully paid. Each result includes bill number, vendor name, due date, total, amount still outstanding, and days until due. Use this when the user asks 'what do I owe?' or 'what's coming up to pay?'",
    input_schema: {
      type: "object" as const,
      properties: {
        daysAhead: {
          type: "number",
          description:
            "How many days forward to look. Defaults to 30. Cap at 90.",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 10, max 50).",
        },
      },
    },
  },
  {
    name: "get_top_customers_by_ar",
    description:
      "Returns the top customers ranked by total outstanding (unpaid) invoice amount. Each result includes customer name, total outstanding, count of open invoices, and oldest invoice age in days. Use this when the user asks 'who owes me the most?' or wants to prioritise collections.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max customers to return (default 10, max 50).",
        },
      },
    },
  },
  {
    name: "get_recurring_profiles",
    description:
      "Returns active recurring revenue / expense profiles. Includes profile name, type (invoice / bill / expense), frequency, amount per occurrence, next occurrence date, and end date (or 'never expires'). Use this when the user asks about recurring revenue, MRR, subscription cost, or scheduled outflows.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
] as const;

const ALLOWED_STRESS = new Set([0, 7, 14, 30]);

const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

/** Dispatcher invoked by the API route on each tool call. Returns
 *  a plain object that Claude sees as the tool result. */
export async function runTool(
  organizationId: string,
  organizationCurrency: string,
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const today = new Date();
  switch (name) {
    case "get_cashflow_summary": {
      const stressDays = ALLOWED_STRESS.has(input.stressDays as number)
        ? (input.stressDays as number)
        : 0;
      const f = await computeForecast(organizationId, today, 84, {
        currency: organizationCurrency,
        stressDays,
      });
      return {
        currency: f.currency,
        scenario:
          stressDays === 0 ? "base" : `stress: +${stressDays} days delay`,
        startingBalance: f.summary.startingBalance,
        endingBalance: f.summary.endingBalance,
        totalInflows: f.summary.totalInflows,
        totalOutflows: f.summary.totalOutflows,
        netCashflow: f.summary.netCashflow,
        minBalance: f.summary.minBalance,
        minBalanceDate: f.summary.minBalanceDate,
        weeksWithDeficit: f.summary.weeksWithDeficit,
        hasInsolvencyRisk: f.summary.hasInsolvencyRisk,
        patternsApplied: f.summary.patternsApplied,
      };
    }

    case "get_weekly_breakdown": {
      const stressDays = ALLOWED_STRESS.has(input.stressDays as number)
        ? (input.stressDays as number)
        : 0;
      const f = await computeForecast(organizationId, today, 84, {
        currency: organizationCurrency,
        stressDays,
      });
      return {
        currency: f.currency,
        scenario:
          stressDays === 0 ? "base" : `stress: +${stressDays} days delay`,
        weeks: f.weeks.map((w, idx) => ({
          weekNumber: idx + 1,
          weekStart: w.weekStart,
          weekEnd: w.weekEnd,
          inflows: w.totalIn,
          outflows: w.totalOut,
          net: w.net,
          endingBalance: w.endingBalance,
          minBalance: w.minBalance,
          status: w.minBalance < 0 ? "below_zero" : w.net < 0 ? "deficit" : "surplus",
        })),
      };
    }

    case "get_overdue_invoices": {
      const limit = clamp(input.limit, 1, 50, 10);
      const invoices = await db.invoice.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          dueDate: { lt: today },
        },
        select: {
          id: true,
          number: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          contact: { select: { displayName: true } },
        },
        orderBy: { dueDate: "asc" },
        take: limit,
      });
      return {
        currency: organizationCurrency,
        invoices: invoices
          .map((inv) => {
            const outstanding = Number(inv.total) - Number(inv.amountPaid);
            return {
              invoiceNumber: inv.number,
              customer: inv.contact.displayName,
              dueDate: format(inv.dueDate, "yyyy-MM-dd"),
              total: Number(inv.total),
              outstanding,
              daysOverdue: Math.max(
                0,
                Math.floor(
                  (today.getTime() - inv.dueDate.getTime()) / 86400000
                )
              ),
            };
          })
          .filter((i) => i.outstanding > 0),
      };
    }

    case "get_upcoming_bills": {
      const daysAhead = clamp(input.daysAhead, 1, 90, 30);
      const limit = clamp(input.limit, 1, 50, 10);
      const cutoff = new Date(today.getTime() + daysAhead * 86400000);
      const bills = await db.bill.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
          dueDate: { lte: cutoff },
        },
        select: {
          id: true,
          number: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          contact: { select: { displayName: true } },
        },
        orderBy: { dueDate: "asc" },
        take: limit,
      });
      return {
        currency: organizationCurrency,
        bills: bills
          .map((b) => {
            const outstanding = Number(b.total) - Number(b.amountPaid);
            return {
              billNumber: b.number,
              vendor: b.contact?.displayName ?? "Unknown vendor",
              dueDate: format(b.dueDate, "yyyy-MM-dd"),
              total: Number(b.total),
              outstanding,
              daysUntilDue: Math.floor(
                (b.dueDate.getTime() - today.getTime()) / 86400000
              ),
            };
          })
          .filter((b) => b.outstanding > 0),
      };
    }

    case "get_top_customers_by_ar": {
      const limit = clamp(input.limit, 1, 50, 10);
      const openInvoices = await db.invoice.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
        select: {
          dueDate: true,
          total: true,
          amountPaid: true,
          contactId: true,
          contact: { select: { displayName: true } },
        },
      });
      type Agg = {
        customer: string;
        totalOutstanding: number;
        invoiceCount: number;
        oldestDueDate: Date;
      };
      const map = new Map<string, Agg>();
      for (const inv of openInvoices) {
        const outstanding = Number(inv.total) - Number(inv.amountPaid);
        if (outstanding <= 0) continue;
        const cur = map.get(inv.contactId) ?? {
          customer: inv.contact.displayName,
          totalOutstanding: 0,
          invoiceCount: 0,
          oldestDueDate: inv.dueDate,
        };
        cur.totalOutstanding += outstanding;
        cur.invoiceCount += 1;
        if (inv.dueDate < cur.oldestDueDate) cur.oldestDueDate = inv.dueDate;
        map.set(inv.contactId, cur);
      }
      const ranked = Array.from(map.values())
        .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
        .slice(0, limit)
        .map((c) => ({
          customer: c.customer,
          totalOutstanding: c.totalOutstanding,
          invoiceCount: c.invoiceCount,
          oldestInvoiceAgeDays: Math.max(
            0,
            Math.floor((today.getTime() - c.oldestDueDate.getTime()) / 86400000)
          ),
        }));
      return { currency: organizationCurrency, customers: ranked };
    }

    case "get_recurring_profiles": {
      const [ri, rb, re] = await Promise.all([
        db.recurringInvoice.findMany({
          where: { organizationId, deletedAt: null, status: "ACTIVE" },
          select: {
            profileName: true,
            frequency: true,
            amount: true,
            endDate: true,
            neverExpires: true,
            nextOccurrenceDate: true,
            nextRunAt: true,
          },
        }),
        db.recurringBill.findMany({
          where: { organizationId, deletedAt: null, status: "ACTIVE" },
          select: {
            profileName: true,
            frequency: true,
            amount: true,
            endDate: true,
            neverExpires: true,
            nextOccurrenceDate: true,
            nextRunAt: true,
          },
        }),
        db.recurringExpense.findMany({
          where: { organizationId, deletedAt: null, status: "ACTIVE" },
          select: {
            profileName: true,
            frequency: true,
            amount: true,
            endDate: true,
            neverExpires: true,
            nextOccurrenceDate: true,
            nextRunAt: true,
          },
        }),
      ]);
      const fmt = (
        p: {
          profileName: string;
          frequency: string;
          amount: { toString(): string } | number;
          endDate: Date | null;
          neverExpires: boolean;
          nextOccurrenceDate: Date | null;
          nextRunAt: Date;
        },
        type: "recurring_invoice" | "recurring_bill" | "recurring_expense"
      ) => ({
        type,
        profileName: p.profileName,
        frequency: p.frequency,
        amount: Number(p.amount),
        nextOccurrence: format(
          p.nextOccurrenceDate ?? p.nextRunAt,
          "yyyy-MM-dd"
        ),
        endDate: p.neverExpires
          ? "never_expires"
          : p.endDate
            ? format(p.endDate, "yyyy-MM-dd")
            : null,
      });
      return {
        currency: organizationCurrency,
        profiles: [
          ...ri.map((p) => fmt(p, "recurring_invoice")),
          ...rb.map((p) => fmt(p, "recurring_bill")),
          ...re.map((p) => fmt(p, "recurring_expense")),
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
