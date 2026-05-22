import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";
import {
  advanceNextSendAt,
  recipientsFromDb,
  type ScheduleFormat,
  type ScheduleFrequency,
} from "@/lib/reports/scheduled";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import { buildProfitAndLoss } from "@/lib/reports/profit-loss";
import {
  buildBalanceSheet,
  type BsAccountInput,
} from "@/lib/reports/balance-sheet";
import {
  buildCashFlowStatement,
  isCashAccount,
  type CashFlowAccountDelta,
} from "@/lib/reports/cash-flow";
import { renderProfitLossPdf } from "@/lib/reports/pdf/profit-loss";
import { renderBalanceSheetPdf } from "@/lib/reports/pdf/balance-sheet";
import { renderCashFlowPdf } from "@/lib/reports/pdf/cash-flow";
import { renderArAgingDetailsPdf } from "@/lib/reports/pdf/ar-aging-details";
import {
  computeArAgingDetails,
  groupArAgingDetails,
  bucketLabels,
} from "@/lib/reports/ar-aging-details";
import { sendReportEmail } from "@/lib/reports/email";
import { logReportActivity } from "@/lib/reports/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * REPORTS — Scheduled report worker.
 *
 * Runs once daily (per vercel.json). For each ScheduledReport whose
 * status is ACTIVE and nextSendAt <= now:
 *   1. Render the report in the configured format (PDF/XLSX/CSV)
 *   2. Email it to the recipients via Resend
 *   3. Record a ScheduledReportRun
 *   4. Log a SCHEDULE_SENT activity
 *   5. Advance nextSendAt by the schedule's frequency
 *
 * On error, record status=FAILED on the run, log the error message,
 * and advance nextSendAt anyway — we'd rather skip one cycle than
 * have the same broken row re-fire every day forever.
 *
 * Idempotency: nextSendAt is updated before the next iteration, so
 * a partial worker run can be re-invoked without double-sending the
 * already-processed rows.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const now = new Date();
  const due = await db.scheduledReport.findMany({
    where: { status: "ACTIVE", nextSendAt: { lte: now } },
    take: 100,
  });

  const results: Array<{
    id: string;
    reportKey: string;
    status: "SENT" | "FAILED";
    error?: string;
  }> = [];

  for (const sched of due) {
    try {
      const org = await db.organization.findUnique({
        where: { id: sched.organizationId },
        select: {
          id: true,
          name: true,
          currency: true,
          fiscalYearStart: true,
        },
      });
      if (!org) {
        await failRun(sched.id, sched.organizationId, sched.recipients, "Organization not found");
        results.push({ id: sched.id, reportKey: sched.reportKey, status: "FAILED", error: "org not found" });
        continue;
      }

      const recipients = recipientsFromDb(sched.recipients);
      if (recipients.length === 0) {
        await failRun(sched.id, sched.organizationId, sched.recipients, "No recipients");
        results.push({ id: sched.id, reportKey: sched.reportKey, status: "FAILED", error: "no recipients" });
        continue;
      }

      // Build the report payload for the chosen reportKey
      const built = await buildReportForKey(
        sched.reportKey,
        org,
        sched.format as ScheduleFormat
      );

      // Send the email
      const emailResult = await sendReportEmail({
        to: recipients,
        subject: `${sched.reportTitle} — Scheduled Report`,
        reportTitle: sched.reportTitle,
        organizationName: org.name,
        attachment: built.attachment,
      });

      if (!emailResult.ok) {
        await failRun(sched.id, sched.organizationId, sched.recipients, emailResult.error);
        await advanceSchedule(sched.id, sched.nextSendAt, sched.frequency as ScheduleFrequency);
        results.push({ id: sched.id, reportKey: sched.reportKey, status: "FAILED", error: emailResult.error });
        continue;
      }

      // Record success + activity + advance
      await db.scheduledReportRun.create({
        data: {
          scheduledReportId: sched.id,
          organizationId: sched.organizationId,
          status: "SUCCESS",
          recipients: sched.recipients,
        },
      });
      await logReportActivity({
        organizationId: sched.organizationId,
        userId: sched.userId,
        reportKey: sched.reportKey,
        eventType: "SCHEDULE_SENT",
        eventData: { recipients },
      });
      await advanceSchedule(sched.id, sched.nextSendAt, sched.frequency as ScheduleFrequency);

      results.push({ id: sched.id, reportKey: sched.reportKey, status: "SENT" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[cron/scheduled-reports] failed", sched.id, msg);
      await failRun(sched.id, sched.organizationId, sched.recipients, msg);
      // Advance anyway so we don't loop on a broken schedule.
      await advanceSchedule(sched.id, sched.nextSendAt, sched.frequency as ScheduleFrequency);
      results.push({ id: sched.id, reportKey: sched.reportKey, status: "FAILED", error: msg });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

async function advanceSchedule(
  scheduledReportId: string,
  currentNext: Date,
  frequency: ScheduleFrequency
): Promise<void> {
  const next = advanceNextSendAt(currentNext, frequency);
  await db.scheduledReport.update({
    where: { id: scheduledReportId },
    data: { nextSendAt: next, lastSentAt: new Date() },
  });
}

async function failRun(
  scheduledReportId: string,
  organizationId: string,
  recipients: string,
  errorMessage: string
): Promise<void> {
  await db.scheduledReportRun.create({
    data: {
      scheduledReportId,
      organizationId,
      status: "FAILED",
      recipients,
      errorMessage,
    },
  });
}

type OrgLite = {
  id: string;
  name: string;
  currency: string;
  fiscalYearStart: number;
};

async function buildReportForKey(
  reportKey: string,
  org: OrgLite,
  fmt: ScheduleFormat
): Promise<{ attachment: { filename: string; content: Buffer } }> {
  // For Phase B we only support PDF format for emailed reports.
  // CSV / XLSX go through their existing export routes when the
  // user clicks Export directly. If a Schedule row was somehow
  // saved with a non-PDF format, we still render a PDF (safer
  // than emailing an empty file).
  void fmt;

  // Use a "This Month" range as the default email window. v1
  // simplification — we can read sched.reportParams.preset later.
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

  if (reportKey === "profit-and-loss") {
    const jeLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: org.id,
          date: { gte: start, lte: end },
        },
        account: {
          type: {
            in: [
              "INCOME",
              "OTHER_INCOME",
              "EXPENSE",
              "COST_OF_GOODS_SOLD",
              "OTHER_EXPENSE",
            ],
          },
        },
      },
      select: {
        debit: true,
        credit: true,
        account: {
          select: { id: true, name: true, code: true, type: true },
        },
      },
    });
    const ledgerRows = aggregateLedgerLines(
      jeLines.map((l) => ({
        account: {
          id: l.account.id,
          name: l.account.name,
          code: l.account.code,
          type: l.account.type as AccountBucket,
        },
        debit: Number(l.debit),
        credit: Number(l.credit),
      }))
    );
    const pnl = buildProfitAndLoss(ledgerRows);
    const dateRangeText = `From ${format(start, "dd/MM/yyyy")} To ${format(end, "dd/MM/yyyy")}`;
    const buf = await renderProfitLossPdf({
      organizationName: org.name,
      dateRangeText,
      pnl,
      currency: org.currency,
    });
    return {
      attachment: { filename: `profit-and-loss.pdf`, content: buf },
    };
  }

  if (reportKey === "balance-sheet") {
    const asOf = end;
    const [accounts, jeLines] = await Promise.all([
      db.chartOfAccount.findMany({
        where: {
          organizationId: org.id,
          isActive: true,
          type: { in: ["ASSET", "LIABILITY", "EQUITY"] },
        },
        select: { id: true, name: true, code: true, type: true, subType: true },
      }),
      db.journalEntryLine.findMany({
        where: {
          journalEntry: { organizationId: org.id, date: { lte: asOf } },
          account: { type: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
        },
        select: {
          debit: true,
          credit: true,
          account: { select: { id: true, name: true, code: true, type: true } },
        },
      }),
    ]);
    const ledger = aggregateLedgerLines(
      jeLines.map((l) => ({
        account: {
          id: l.account.id,
          name: l.account.name,
          code: l.account.code,
          type: l.account.type as AccountBucket,
        },
        debit: Number(l.debit),
        credit: Number(l.credit),
      }))
    );
    const ledgerByAccountId = new Map(ledger.map((r) => [r.accountId, r]));
    const inputs: BsAccountInput[] = accounts.map((a) => ({
      accountId: a.id,
      accountName: a.name,
      accountCode: a.code,
      accountType: a.type as AccountBucket,
      accountSubType: a.subType,
      netBalance: ledgerByAccountId.get(a.id)?.netBalance ?? 0,
    }));
    const bs = buildBalanceSheet(inputs);
    const buf = await renderBalanceSheetPdf({
      organizationName: org.name,
      asOfText: format(asOf, "dd/MM/yyyy"),
      bs,
      currency: org.currency,
    });
    return {
      attachment: { filename: `balance-sheet.pdf`, content: buf },
    };
  }

  if (reportKey === "cash-flow-statement") {
    // Simplified: just build with zeros for the email window if
    // there's no data. The on-screen Cash Flow page has the rich
    // beginning-balance / non-cash-deltas math; for the emailed
    // PDF we'll defer to the next phase to fully replicate it.
    // For v1 of the scheduled cron we emit a basic indirect-method
    // statement using the same query shape as the on-screen page.

    // Beginning cash balance
    const cashAccountsList = await db.chartOfAccount.findMany({
      where: {
        organizationId: org.id,
        type: "ASSET",
        subType: { in: ["Cash", "Bank"] },
      },
      select: { id: true, name: true, code: true, type: true, subType: true },
    });
    const cashAccountIds = cashAccountsList.map((a) => a.id);
    const beginningLines = await db.journalEntryLine.findMany({
      where: {
        accountId: { in: cashAccountIds },
        journalEntry: { organizationId: org.id, date: { lt: start } },
      },
      select: { debit: true, credit: true },
    });
    const beginningCashBalance = beginningLines.reduce(
      (s, l) => s + Number(l.debit) - Number(l.credit),
      0
    );

    // Period delta on cash
    const periodCashLines = await db.journalEntryLine.findMany({
      where: {
        accountId: { in: cashAccountIds },
        journalEntry: {
          organizationId: org.id,
          date: { gte: start, lte: end },
        },
      },
      select: { debit: true, credit: true },
    });
    const cashPeriodDelta = periodCashLines.reduce(
      (s, l) => s + Number(l.debit) - Number(l.credit),
      0
    );
    const endingCashBalance = beginningCashBalance + cashPeriodDelta;

    // Net income
    const incomeLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: { organizationId: org.id, date: { gte: start, lte: end } },
        account: {
          type: {
            in: ["INCOME", "OTHER_INCOME", "EXPENSE", "COST_OF_GOODS_SOLD", "OTHER_EXPENSE"],
          },
        },
      },
      select: {
        debit: true,
        credit: true,
        account: { select: { type: true } },
      },
    });
    let netIncome = 0;
    for (const l of incomeLines) {
      const sign =
        l.account.type === "INCOME" || l.account.type === "OTHER_INCOME"
          ? 1
          : -1;
      netIncome += sign * (Number(l.credit) - Number(l.debit));
    }

    // Non-cash deltas — for the emailed v1 we just leave empty
    // and rely on net income as the dominant operating signal.
    const nonCashDeltas: CashFlowAccountDelta[] = [];

    const cf = buildCashFlowStatement({
      beginningCashBalance,
      endingCashBalance,
      netIncome,
      nonCashDeltas,
    });

    void isCashAccount;

    const dateRangeText = `From ${format(start, "dd/MM/yyyy")} To ${format(end, "dd/MM/yyyy")}`;
    const buf = await renderCashFlowPdf({
      organizationName: org.name,
      dateRangeText,
      cf,
      currency: org.currency,
    });
    return {
      attachment: { filename: `cash-flow.pdf`, content: buf },
    };
  }

  if (reportKey === "ar-aging-details") {
    // DOC-AR-DETAILS: Scheduled email export. Pulls all outstanding
    // invoices + open credit notes for the org, runs the standard
    // aging compute with the default 4x15 bucket grid, then renders
    // the PDF using the same template as the on-screen Export → PDF.
    const asOf = new Date();
    const [invoices, creditNotes] = await Promise.all([
      db.invoice.findMany({
        where: {
          organizationId: org.id,
          deletedAt: null,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
        include: { contact: { select: { displayName: true, type: true } } },
      }),
      db.creditNote.findMany({
        where: {
          organizationId: org.id,
          deletedAt: null,
          status: "OPEN",
        },
        include: { contact: { select: { displayName: true } } },
      }),
    ]);

    const rows = computeArAgingDetails({
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        total: Number(i.total),
        amountPaid: Number(i.amountPaid),
        status: i.status,
        contactId: i.contactId,
        contact: i.contact,
      })),
      creditNotes: creditNotes.map((c) => ({
        id: c.id,
        number: c.number,
        date: c.date,
        total: Number(c.total),
        amountApplied: Number(c.amountApplied),
        amountRefunded: Number(c.amountRefunded),
        status: c.status,
        contactId: c.contactId,
        contact: c.contact,
      })),
      asOf,
      agingBy: "dueDate",
      intervalCount: 4,
      intervalSize: 15,
      entities: ["invoice", "creditnote"],
    });

    const bucketsForOrdering = bucketLabels(4, 15);
    const groups = groupArAgingDetails(rows, "none", bucketsForOrdering);
    const grandTotal = rows.reduce((s, r) => s + r.balanceDue, 0);

    const buf = await renderArAgingDetailsPdf({
      orgName: org.name,
      reportTitle: "AR Aging Details By Invoice Due Date",
      asOfDisplay: format(asOf, "dd/MM/yyyy"),
      groups,
      flatRows: rows,
      grandTotal,
      cols: [
        "date",
        "dueDate",
        "number",
        "type",
        "status",
        "customerName",
        "age",
        "amount",
        "balanceDue",
      ],
      groupBy: "none",
    });
    return {
      attachment: { filename: `ar-aging-details.pdf`, content: buf },
    };
  }

  throw new Error(`Unsupported reportKey for scheduled email: ${reportKey}`);
}
