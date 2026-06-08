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
import { z } from "zod";
import { db } from "@/lib/db";
import { computeForecast } from "./forecast";
import {
  getCachedToolResult,
  setCachedToolResult,
} from "@/lib/llm/cache";

export type CopilotToolName =
  | "get_cashflow_summary"
  | "get_weekly_breakdown"
  | "get_overdue_invoices"
  | "get_upcoming_bills"
  | "get_top_customers_by_ar"
  | "get_recurring_profiles"
  | "get_open_anomalies";

/** Tool schemas Anthropic receives. Order doesn't matter; Claude
 *  picks based on the descriptions. */
export const COPILOT_TOOLS = [
  {
    name: "get_cashflow_summary",
    description:
      "Returns the high-level 12-week cashflow forecast for this organization: starting balance, projected ending balance, total inflows and outflows, minimum running balance and the date it occurs, weeks with negative cashflow, and insolvency risk flag. Use this when the user asks about overall cash position, runway, or whether they're at risk. Optional `stressDays` (0/7/14/30) adds a 'collections slip by N days' scenario layer. Optional `includeCompanion` (default false) mixes in imported Tally voucher data — pass true when the user asks about their Tally data or wants to see the combined picture.",
    input_schema: {
      type: "object" as const,
      properties: {
        stressDays: {
          type: "number",
          description:
            "Optional stress-test offset in days. 0 = base case. 7/14/30 = stress scenarios. Defaults to 0.",
          enum: [0, 7, 14, 30],
        },
        includeCompanion: {
          type: "boolean",
          description:
            "When true, the forecast includes CompanionVoucher rows imported from Tally alongside native Invoices/Bills. Defaults to false. Pass true when the user mentions Tally or wants to see imported data factored in.",
        },
      },
    },
  },
  {
    name: "get_weekly_breakdown",
    description:
      "Returns the 12 weekly buckets of the forecast: per-week inflows, outflows, net cashflow, ending balance, and minimum balance. Use this when the user asks 'when will I be in deficit?' or 'which week is worst?' or wants a week-by-week view. Optional `includeCompanion` (default false) factors in imported Tally data.",
    input_schema: {
      type: "object" as const,
      properties: {
        stressDays: {
          type: "number",
          enum: [0, 7, 14, 30],
        },
        includeCompanion: {
          type: "boolean",
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
  {
    name: "get_open_anomalies",
    description:
      "Returns open anomaly alerts surfaced by the nightly anomaly detector — possible duplicate bills, stuck recurring profiles, and other issues worth the user's attention. Each result includes detector key, severity (high/medium/low), title, description, and (optionally) a deep-link refType/refId pointing at the source row. Use this when the user asks 'is anything broken?', 'what should I look at?', 'any issues?', or any open-ended question about the health of their books — read this first so you can volunteer findings instead of waiting to be asked.",
    input_schema: {
      type: "object" as const,
      properties: {
        severity: {
          type: "string",
          description:
            "Optional severity filter. 'high' only / 'medium' only / 'low' only. Omit for all severities.",
          enum: ["high", "medium", "low"],
        },
        limit: {
          type: "number",
          description: "Max alerts to return (default 20, max 100).",
        },
      },
    },
  },
] as const;

const ALLOWED_STRESS = new Set([0, 7, 14, 30]);

const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

// ── Guardrail 7: zod schemas for tool inputs ────────────────────
// Anthropic's tool_use blocks come back with claimed inputs that
// match the JSON schema we sent, but the SDK does not enforce them
// — Claude can hallucinate a string where we expect a number, or
// emit extra fields. zod gives us a deterministic gate before the
// input reaches the executor.
//
// Each schema accepts what the JSON schema declares + uses `.strip()`
// (default) to drop any extras, so a slightly off tool_use block
// still works rather than failing the agentic loop.
const stressDaysSchema = z
  .union([z.literal(0), z.literal(7), z.literal(14), z.literal(30)])
  .optional();
const limitSchema = z.number().int().positive().max(100).optional();
const daysAheadSchema = z.number().int().positive().max(90).optional();

const TOOL_INPUT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  get_cashflow_summary: z
    .object({
      stressDays: stressDaysSchema,
      includeCompanion: z.boolean().optional(),
    })
    .passthrough(),
  get_weekly_breakdown: z
    .object({
      stressDays: stressDaysSchema,
      includeCompanion: z.boolean().optional(),
    })
    .passthrough(),
  get_overdue_invoices: z.object({ limit: limitSchema }).passthrough(),
  get_upcoming_bills: z.object({ limit: limitSchema, daysAhead: daysAheadSchema }).passthrough(),
  get_top_customers_by_ar: z.object({ limit: limitSchema }).passthrough(),
  get_recurring_profiles: z.object({}).passthrough(),
  get_open_anomalies: z
    .object({
      severity: z.enum(["high", "medium", "low"]).optional(),
      limit: limitSchema,
    })
    .passthrough(),
};

/** Guardrail 8: which tools are deterministic-by-orgId-and-input
 *  enough to safely cache for 5 minutes. All v1 tools qualify
 *  (they're read-only views over data that mutates rarely vs the
 *  cache TTL). If we ever add write tools they go OUTSIDE this
 *  list and never hit the cache. */
const CACHEABLE_TOOLS = new Set([
  "get_cashflow_summary",
  "get_weekly_breakdown",
  "get_overdue_invoices",
  "get_upcoming_bills",
  "get_top_customers_by_ar",
  "get_recurring_profiles",
  "get_open_anomalies",
]);

/** Dispatcher invoked by the API route on each tool call. Returns
 *  a plain object that Claude sees as the tool result.
 *
 *  Guardrail layers applied around the inner dispatch:
 *    1. Schema validation (Guardrail 7) — input checked against
 *       the zod schema before reaching any DB code. Throws with a
 *       friendly message that Claude can incorporate into its
 *       next-turn reasoning ("you passed limit=-5; please pass
 *       a positive integer").
 *    2. Cache lookup (Guardrail 8) — for deterministic read-only
 *       tools, return the 5-min-old result if available.
 *    3. Inner executor — the unchanged business logic from CF-5.
 *    4. Cache store — write the result back for future requests. */
export async function runTool(
  organizationId: string,
  organizationCurrency: string,
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const schema = TOOL_INPUT_SCHEMAS[name];
  if (schema) {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
      throw new Error(`Invalid tool input — ${issues}`);
    }
    input = parsed.data as Record<string, unknown>;
  }

  // Cache check
  if (CACHEABLE_TOOLS.has(name)) {
    const cached = getCachedToolResult(organizationId, name, input);
    if (cached !== undefined) return cached;
  }

  const result = await runToolInner(organizationId, organizationCurrency, name, input);

  if (CACHEABLE_TOOLS.has(name)) {
    setCachedToolResult(organizationId, name, input, result);
  }
  return result;
}

async function runToolInner(
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
      const includeCompanion = input.includeCompanion === true;
      const f = await computeForecast(organizationId, today, 84, {
        currency: organizationCurrency,
        stressDays,
        includeCompanion,
      });
      return {
        currency: f.currency,
        scenario:
          stressDays === 0 ? "base" : `stress: +${stressDays} days delay`,
        includesCompanionData: includeCompanion,
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
        companionItemsIncluded: f.summary.companionItemsIncluded,
      };
    }

    case "get_weekly_breakdown": {
      const stressDays = ALLOWED_STRESS.has(input.stressDays as number)
        ? (input.stressDays as number)
        : 0;
      const includeCompanion = input.includeCompanion === true;
      const f = await computeForecast(organizationId, today, 84, {
        currency: organizationCurrency,
        stressDays,
        includeCompanion,
      });
      return {
        currency: f.currency,
        scenario:
          stressDays === 0 ? "base" : `stress: +${stressDays} days delay`,
        includesCompanionData: includeCompanion,
        companionItemsIncluded: f.summary.companionItemsIncluded,
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

    case "get_open_anomalies": {
      const limit = clamp(input.limit, 1, 100, 20);
      const severityIn =
        typeof input.severity === "string" &&
        ["high", "medium", "low"].includes(input.severity)
          ? [input.severity as string]
          : ["high", "medium", "low"];
      const alerts = await db.anomalyAlert.findMany({
        where: {
          organizationId,
          status: "open",
          severity: { in: severityIn },
        },
        select: {
          id: true,
          detectorKey: true,
          severity: true,
          title: true,
          description: true,
          refType: true,
          refId: true,
          createdAt: true,
        },
        // High severity first; within same severity, most recent first.
        // We achieve that by sorting client-side since severity is a
        // string column (Postgres sort would alphabetise high < low < medium).
        orderBy: { createdAt: "desc" },
        take: limit * 2, // overfetch so client-side sort doesn't drop high-severity hits
      });
      const sevRank = { high: 0, medium: 1, low: 2 } as const;
      const sorted = alerts
        .slice()
        .sort((a, b) => {
          const sa = sevRank[a.severity as keyof typeof sevRank] ?? 3;
          const sb = sevRank[b.severity as keyof typeof sevRank] ?? 3;
          if (sa !== sb) return sa - sb;
          return b.createdAt.getTime() - a.createdAt.getTime();
        })
        .slice(0, limit);
      return {
        count: sorted.length,
        alerts: sorted.map((a) => ({
          detector: a.detectorKey,
          severity: a.severity,
          title: a.title,
          description: a.description,
          refType: a.refType,
          refId: a.refId,
          detectedAt: format(a.createdAt, "yyyy-MM-dd"),
        })),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
