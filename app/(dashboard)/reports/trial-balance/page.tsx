import * as React from "react";
import { AlertCircle, Info } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { ReportShell } from "@/components/reports/report-shell";
import { ReportFilterStrip } from "@/components/reports/report-filter-strip";
import { ReportBasisDropdown } from "@/components/reports/report-basis-dropdown";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { parseReportBasis, REPORT_BASIS_LABEL } from "@/lib/reports/report-basis";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import { buildTrialBalance } from "@/lib/reports/trial-balance";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";
import type { CustomizeColumnDescriptor } from "@/components/reports/customize-report-drawer";

export const metadata = { title: "Trial Balance" };

/**
 * RPT-TB — Trial Balance.
 *
 * Zoho-parity rebuild (Item #2): drops the bare HTML form / manual
 * CSV button in favour of the shared `ReportShell` + `ReportToolbar`
 * stack used by P&L, Balance Sheet, Cash Flow, and AR Aging Details.
 *
 * Shows a 5-group rollup (Assets / Liabilities / Equities / Income /
 * Expense) with a single Net Debit OR Net Credit column entry per
 * account. Imbalance amber banner appears when Σ DR ≠ Σ CR.
 */

/**
 * DOC-TB: Column descriptors for the shared Customize Report drawer.
 * Account Code is OFF by default to match Zoho's 3-column layout
 * (Account / Net Debit / Net Credit). User can switch it on via the
 * Customize → Show/Hide Columns drawer.
 */
const COLUMN_DESCRIPTORS: CustomizeColumnDescriptor[] = [
  { key: "showAccountCode", label: "Account Code", defaultEnabled: false },
  { key: "showAccount", label: "Account", defaultEnabled: true },
  { key: "showNetDebit", label: "Net Debit", defaultEnabled: true },
  { key: "showNetCredit", label: "Net Credit", defaultEnabled: true },
];

/** Map a column display key to its show<X> URL param. */
const COL_PARAM_BY_KEY = {
  accountCode: "showAccountCode",
  account: "showAccount",
  netDebit: "showNetDebit",
  netCredit: "showNetCredit",
} as const;

function isVisible(
  searchParams: Record<string, string | undefined> | undefined,
  paramKey: string,
  defaultVisible: boolean
): boolean {
  const v = searchParams?.[paramKey];
  if (v === undefined) return defaultVisible;
  return v !== "0";
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const { organization, user } = await requireOrganization();
  const cur = organization.currency;

  // Parse "As of Date" — defaults to today. We accept yyyy-MM-dd.
  const asOf = parseAsOf(searchParams?.asOf);
  const basis = parseReportBasis(searchParams ?? {});

  // Column visibility from Customize drawer
  const showAccountCode = isVisible(
    searchParams,
    COL_PARAM_BY_KEY.accountCode,
    false
  );
  const showAccount = isVisible(
    searchParams,
    COL_PARAM_BY_KEY.account,
    true
  );
  const showNetDebit = isVisible(
    searchParams,
    COL_PARAM_BY_KEY.netDebit,
    true
  );
  const showNetCredit = isVisible(
    searchParams,
    COL_PARAM_BY_KEY.netCredit,
    true
  );

  // Compute the trial balance + pre-fetch shared toolbar data in
  // parallel so the report renders fast even with cold caches.
  const [lines, activityRows, existingSchedule] = await Promise.all([
    db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: organization.id,
          date: { lte: asOf },
        },
      },
      select: {
        debit: true,
        credit: true,
        accountId: true,
        account: {
          select: { id: true, name: true, code: true, type: true },
        },
      },
    }),
    getRecentReportActivity(organization.id, "trial-balance", 20),
    getExistingSchedule({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "trial-balance",
    }),
  ]);

  const rows = aggregateLedgerLines(
    lines.map((l) => ({
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

  const tb = buildTrialBalance(rows);

  // Preserve current filters for export links + Customize drawer
  // (matches how P&L / AR Aging build their exportParams).
  const exportParams = new URLSearchParams();
  exportParams.set("asOf", format(asOf, "yyyy-MM-dd"));
  exportParams.set("basis", basis);
  if (!showAccountCode) exportParams.set("showAccountCode", "0");
  if (!showAccount) exportParams.set("showAccount", "0");
  if (!showNetDebit) exportParams.set("showNetDebit", "0");
  if (!showNetCredit) exportParams.set("showNetCredit", "0");

  const asOfDisplay = format(asOf, "dd/MM/yyyy");
  const visibleColCount =
    (showAccountCode ? 1 : 0) +
    (showAccount ? 1 : 0) +
    (showNetDebit ? 1 : 0) +
    (showNetCredit ? 1 : 0);

  return (
    <ReportShell
      title="Trial Balance"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Accountant</span>
          <span className="text-muted-foreground">•</span>
          <span>As of {asOfDisplay}</span>
        </span>
      }
      range={
        <ReportFilterStrip>
          <AsOfDateForm asOf={asOf} basis={basis} />
          <ReportBasisDropdown defaultBasis={basis} />
        </ReportFilterStrip>
      }
      actions={
        <ReportToolbar
          reportKey="trial-balance"
          reportTitle="Trial Balance"
          fiscalYearStartMonth={organization.fiscalYearStart}
          exportBaseUrl="/reports/trial-balance/export"
          exportParams={exportParams.toString()}
          columns={COLUMN_DESCRIPTORS}
          activityRows={activityRows}
          existingSchedule={existingSchedule}
        />
      }
    >
      <Card className="p-0 overflow-hidden">
        {/* Centered report header (org / title / basis / as-of) */}
        <div className="text-center space-y-1 pt-8 pb-6">
          <div className="text-sm text-muted-foreground">
            {organization.name}
          </div>
          <h2 className="text-xl font-semibold">Trial Balance</h2>
          <div className="text-sm">
            <span className="text-muted-foreground">Basis: </span>
            <span className="font-medium">{REPORT_BASIS_LABEL[basis]}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">As of </span>
            <span className="font-medium">{asOfDisplay}</span>
          </div>
        </div>

        {tb.imbalance > 0.005 ? (
          <div className="mx-6 mb-4 rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-amber-900 dark:text-amber-200">
                Imbalance: {formatMoney(tb.imbalance, cur)}
              </div>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">
                Σ Debit ≠ Σ Credit. Not every domain record posts to the
                journal yet (invoices, bills, payments) — Bank Categorise +
                Manual Journals do. The gap above is the unposted amount.
              </p>
            </div>
          </div>
        ) : null}

        {/* DOC-TB-EMPTY: Show a contextual info banner when the entire
            report is empty so users understand why their existing
            invoices / bills / etc. aren't reflected. Records only
            reach the ledger at specific lifecycle gates — see the
            mapping below. */}
        {tb.totalDebit === 0 && tb.totalCredit === 0 ? (
          <div className="mx-6 mb-4 rounded-md border border-blue-500/40 bg-blue-50/50 dark:bg-blue-950/20 p-3 text-sm flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-blue-900 dark:text-blue-200">
                No posted journal entries yet
              </div>
              <p className="text-xs text-blue-800/80 dark:text-blue-200/80 mt-1">
                Records in Quikfinance only post to the ledger at specific
                points. If your numbers look empty, check:
              </p>
              <ul className="text-xs text-blue-800/80 dark:text-blue-200/80 mt-1.5 ml-4 list-disc space-y-0.5">
                <li>
                  <span className="font-medium">Invoices</span> must be{" "}
                  <span className="font-medium">Sent</span> (DRAFT invoices
                  don&apos;t post)
                </li>
                <li>
                  <span className="font-medium">Bills</span> must be{" "}
                  <span className="font-medium">Opened</span> (DRAFT bills
                  don&apos;t post)
                </li>
                <li>
                  <span className="font-medium">Manual Journals</span> must be{" "}
                  <span className="font-medium">Published</span>
                </li>
                <li>
                  <span className="font-medium">Bank lines</span> need to be{" "}
                  <span className="font-medium">Categorised</span>
                </li>
                <li>
                  <span className="font-medium">Expenses</span> from bank
                  Money-Out categorisation don&apos;t post to the ledger yet
                  (known gap)
                </li>
              </ul>
            </div>
          </div>
        ) : null}

        {/* DOC-TB: Always render the table with all 5 group rows
            (Assets / Liabilities / Equities / Income / Expense) even
            when empty — matches Zoho's layout. The lib emits the 5
            placeholder groups even on an empty ledger. */}
        <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {showAccountCode ? (
                  <th className="text-left p-3 w-24">Code</th>
                ) : null}
                {showAccount ? (
                  <th className="text-left p-3">Account</th>
                ) : null}
                {showNetDebit ? (
                  <th className="text-right p-3 w-40">Net Debit</th>
                ) : null}
                {showNetCredit ? (
                  <th className="text-right p-3 w-40">Net Credit</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {tb.groups.map((g) => (
                <React.Fragment key={g.groupKey}>
                  {/* Group header row */}
                  <tr className="bg-muted/10">
                    <td
                      colSpan={visibleColCount}
                      className="px-3 py-2 font-semibold text-sm"
                    >
                      {g.groupLabel}
                    </td>
                  </tr>
                  {/* Account rows */}
                  {g.rows.map((r) => (
                    <tr key={r.accountId} className="hover:bg-muted/30">
                      {showAccountCode ? (
                        <td className="p-3 pl-6 font-mono text-xs text-muted-foreground">
                          {r.accountCode ?? ""}
                        </td>
                      ) : null}
                      {showAccount ? (
                        <td className="p-3 pl-6">{r.accountName}</td>
                      ) : null}
                      {showNetDebit ? (
                        <td className="p-3 text-right tabular-nums">
                          {r.netDebit > 0 ? formatMoney(r.netDebit, cur) : ""}
                        </td>
                      ) : null}
                      {showNetCredit ? (
                        <td className="p-3 text-right tabular-nums">
                          {r.netCredit > 0 ? formatMoney(r.netCredit, cur) : ""}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 border-t-2">
              <tr>
                <td
                  className="p-3 font-semibold"
                  colSpan={
                    (showAccountCode ? 1 : 0) + (showAccount ? 1 : 0) || 1
                  }
                >
                  Total for Trial Balance
                </td>
                {showNetDebit ? (
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(tb.totalDebit, cur)}
                  </td>
                ) : null}
                {showNetCredit ? (
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(tb.totalCredit, cur)}
                  </td>
                ) : null}
              </tr>
            </tfoot>
          </table>

        <div className="px-6 pt-4 pb-6 text-[11px] text-muted-foreground">
          **Amount is displayed in your base currency{" "}
          <span className="inline-block ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium text-[10px]">
            {cur}
          </span>
        </div>
      </Card>
    </ReportShell>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function parseAsOf(s: string | undefined): Date {
  if (!s) return new Date();
  // Accept yyyy-MM-dd (from the date input) — fall back to today.
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : new Date();
}

/**
 * AsOfDateForm — a thin server-rendered form pill that posts back to
 * /reports/trial-balance preserving the basis. Sits in the
 * `ReportFilterStrip` slot next to the basis dropdown.
 */
function AsOfDateForm({ asOf, basis }: { asOf: Date; basis: string }) {
  return (
    <form
      method="GET"
      action="/reports/trial-balance"
      className="inline-flex items-center gap-2 px-2 py-1 rounded-full border bg-background text-xs"
    >
      <span className="text-muted-foreground">As of Date :</span>
      <input
        type="date"
        name="asOf"
        defaultValue={format(asOf, "yyyy-MM-dd")}
        className="h-6 px-1 rounded border bg-background text-xs"
      />
      <input type="hidden" name="basis" value={basis} />
      <button
        type="submit"
        className="text-primary hover:underline text-xs"
      >
        Apply
      </button>
    </form>
  );
}
