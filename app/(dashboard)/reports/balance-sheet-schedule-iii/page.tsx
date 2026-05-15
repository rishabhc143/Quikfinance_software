import { format, subMonths, endOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/reports/report-shell";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { ReportFilterStrip } from "@/components/reports/report-filter-strip";
import { BalanceSheetAsOfPill } from "@/components/reports/balance-sheet-as-of-pill";
import { ReportBasisDropdown } from "@/components/reports/report-basis-dropdown";
import {
  parseReportBasis,
  REPORT_BASIS_LABEL,
} from "@/lib/reports/report-basis";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildScheduleIIIBalanceSheet,
  type Sch3BalanceSheet,
  type Sch3BsInput,
} from "@/lib/reports/balance-sheet-schedule-iii";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";

export const metadata = { title: "Balance Sheet (Schedule III)" };

/**
 * REPORTS — Balance Sheet (Schedule III).
 *
 * Two-column comparative layout matching the Companies Act 2013
 * Schedule III, Part I. As-of date input with auto-shifted
 * previous month for the comparison column.
 */
export default async function BalanceSheetScheduleIIIPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization, user } = await requireOrganization();

  const asOf = parseAsOf(searchParams.as_of) ?? endOfDay(new Date());
  const previousAsOf = endOfDay(subMonths(asOf, 1));
  const asOfText = format(asOf, "dd/MM/yyyy");
  const previousAsOfText = format(previousAsOf, "dd/MM/yyyy");
  const basis = parseReportBasis(searchParams);

  // Fetch both periods' balance-sheet account snapshots in parallel.
  const [currentInputs, previousInputs] = await Promise.all([
    fetchBsInputs(organization.id, asOf),
    fetchBsInputs(organization.id, previousAsOf),
  ]);

  const currentBs = buildScheduleIIIBalanceSheet(currentInputs);
  const previousBs = buildScheduleIIIBalanceSheet(previousInputs);
  const cur = organization.currency;

  const activityRows = await getRecentReportActivity(
    organization.id,
    "balance-sheet-schedule-iii",
    20
  );
  const existingSchedule = await getExistingSchedule({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "balance-sheet-schedule-iii",
  });

  return (
    <ReportShell
      title="Balance Sheet (Schedule III)"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Business Overview</span>
          <span className="text-muted-foreground">•</span>
          <span>As of {asOfText}</span>
        </span>
      }
      range={
        <ReportFilterStrip>
          <BalanceSheetAsOfPill defaultValue={format(asOf, "yyyy-MM-dd")} />
          <ReportBasisDropdown defaultBasis={basis} />
        </ReportFilterStrip>
      }
      actions={
        <ReportToolbar
          reportKey="balance-sheet-schedule-iii"
          reportTitle="Balance Sheet (Schedule III)"
          fiscalYearStartMonth={organization.fiscalYearStart}
          exportBaseUrl="/reports/balance-sheet-schedule-iii/export"
          exportParams={`as_of=${format(asOf, "yyyy-MM-dd")}`}
          activityRows={activityRows}
          existingSchedule={existingSchedule}
        />
      }
    >
      <Card className="p-0 overflow-hidden">
        <div className="text-center space-y-1 pt-8 pb-6">
          <div className="text-sm text-muted-foreground">
            {organization.name}
          </div>
          <h2 className="text-xl font-semibold">
            Balance Sheet (Schedule III)
          </h2>
          <div className="text-sm">
            <span className="text-muted-foreground">Basis</span>
            <span className="mx-1.5">:</span>
            <span>{REPORT_BASIS_LABEL[basis]}</span>
            {basis === "cash" ? (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600">
                beta — same data as accrual for now
              </span>
            ) : null}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Particulars</th>
              <th className="text-right px-6 py-3 font-medium w-24">
                Note No.
              </th>
              <th className="text-right px-6 py-3 font-medium w-36">
                As of {asOfText}
              </th>
              <th className="text-right px-6 py-3 font-medium w-36">
                As of {previousAsOfText}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <SectionHeader label="I. EQUITY AND LIABILITIES" />
            <SubHeader num="(1)" label="Shareholders' Funds" />
            <Row
              indent={2}
              letter="(a)"
              label="Share Capital"
              curr={currentBs.equityAndLiabilities.shareholdersFunds.shareCapital}
              prev={previousBs.equityAndLiabilities.shareholdersFunds.shareCapital}
            />
            <Row
              indent={2}
              letter="(b)"
              label="Reserves and Surplus"
              curr={
                currentBs.equityAndLiabilities.shareholdersFunds.reservesAndSurplus
              }
              prev={
                previousBs.equityAndLiabilities.shareholdersFunds.reservesAndSurplus
              }
            />
            <Row
              indent={2}
              letter="(c)"
              label="Money received against share warrants"
              curr={
                currentBs.equityAndLiabilities.shareholdersFunds
                  .moneyAgainstShareWarrants
              }
              prev={
                previousBs.equityAndLiabilities.shareholdersFunds
                  .moneyAgainstShareWarrants
              }
            />
            <Subtotal
              indent={1}
              label="Shareholders' Funds (Total)"
              curr={currentBs.equityAndLiabilities.shareholdersFunds.total}
              prev={previousBs.equityAndLiabilities.shareholdersFunds.total}
            />

            <Row
              indent={1}
              letter="(2)"
              label="Share application money pending allotment"
              curr={currentBs.equityAndLiabilities.shareApplicationPending}
              prev={previousBs.equityAndLiabilities.shareApplicationPending}
            />

            <SubHeader num="(3)" label="Non-Current Liabilities" />
            <Row
              indent={2}
              letter="(a)"
              label="Long-term borrowings"
              curr={
                currentBs.equityAndLiabilities.nonCurrentLiabilities.longTermBorrowings
              }
              prev={
                previousBs.equityAndLiabilities.nonCurrentLiabilities.longTermBorrowings
              }
            />
            <Row
              indent={2}
              letter="(b)"
              label="Deferred tax liabilities (Net)"
              curr={
                currentBs.equityAndLiabilities.nonCurrentLiabilities.deferredTaxLiabilities
              }
              prev={
                previousBs.equityAndLiabilities.nonCurrentLiabilities.deferredTaxLiabilities
              }
            />
            <Row
              indent={2}
              letter="(c)"
              label="Other Long term liabilities"
              curr={
                currentBs.equityAndLiabilities.nonCurrentLiabilities.otherLongTermLiabilities
              }
              prev={
                previousBs.equityAndLiabilities.nonCurrentLiabilities.otherLongTermLiabilities
              }
            />
            <Row
              indent={2}
              letter="(d)"
              label="Long term provisions"
              curr={
                currentBs.equityAndLiabilities.nonCurrentLiabilities.longTermProvisions
              }
              prev={
                previousBs.equityAndLiabilities.nonCurrentLiabilities.longTermProvisions
              }
            />
            <Subtotal
              indent={1}
              label="Non-Current Liabilities (Total)"
              curr={currentBs.equityAndLiabilities.nonCurrentLiabilities.total}
              prev={previousBs.equityAndLiabilities.nonCurrentLiabilities.total}
            />

            <SubHeader num="(4)" label="Current Liabilities" />
            <Row
              indent={2}
              letter="(a)"
              label="Short-term borrowings"
              curr={
                currentBs.equityAndLiabilities.currentLiabilities.shortTermBorrowings
              }
              prev={
                previousBs.equityAndLiabilities.currentLiabilities.shortTermBorrowings
              }
            />
            <Row
              indent={2}
              letter="(b)"
              label="Trade payables"
              curr={currentBs.equityAndLiabilities.currentLiabilities.tradePayables}
              prev={previousBs.equityAndLiabilities.currentLiabilities.tradePayables}
            />
            <Row
              indent={2}
              letter="(c)"
              label="Other current liabilities"
              curr={
                currentBs.equityAndLiabilities.currentLiabilities.otherCurrentLiabilities
              }
              prev={
                previousBs.equityAndLiabilities.currentLiabilities.otherCurrentLiabilities
              }
            />
            <Row
              indent={2}
              letter="(d)"
              label="Short-term provisions"
              curr={
                currentBs.equityAndLiabilities.currentLiabilities.shortTermProvisions
              }
              prev={
                previousBs.equityAndLiabilities.currentLiabilities.shortTermProvisions
              }
            />
            <Subtotal
              indent={1}
              label="Current Liabilities (Total)"
              curr={currentBs.equityAndLiabilities.currentLiabilities.total}
              prev={previousBs.equityAndLiabilities.currentLiabilities.total}
            />

            <Subtotal
              indent={0}
              label="Total Equity and Liabilities"
              curr={currentBs.equityAndLiabilities.total}
              prev={previousBs.equityAndLiabilities.total}
              emphasize
            />

            <SectionHeader label="II. ASSETS" />
            <SubHeader num="(1)" label="Non-current assets" />
            <SubHeader2 letter="(a)" label="Fixed assets" />
            <Row
              indent={3}
              letter="(i)"
              label="Tangible assets"
              curr={
                currentBs.assets.nonCurrentAssets.fixedAssets.tangibleAssets
              }
              prev={
                previousBs.assets.nonCurrentAssets.fixedAssets.tangibleAssets
              }
            />
            <Row
              indent={3}
              letter="(ii)"
              label="Intangible assets"
              curr={
                currentBs.assets.nonCurrentAssets.fixedAssets.intangibleAssets
              }
              prev={
                previousBs.assets.nonCurrentAssets.fixedAssets.intangibleAssets
              }
            />
            <Row
              indent={3}
              letter="(iii)"
              label="Capital work-in-progress"
              curr={
                currentBs.assets.nonCurrentAssets.fixedAssets.capitalWorkInProgress
              }
              prev={
                previousBs.assets.nonCurrentAssets.fixedAssets.capitalWorkInProgress
              }
            />
            <Row
              indent={3}
              letter="(iv)"
              label="Intangible assets under development"
              curr={
                currentBs.assets.nonCurrentAssets.fixedAssets
                  .intangibleAssetsUnderDevelopment
              }
              prev={
                previousBs.assets.nonCurrentAssets.fixedAssets
                  .intangibleAssetsUnderDevelopment
              }
            />
            <Subtotal
              indent={2}
              label="Fixed assets (Total)"
              curr={currentBs.assets.nonCurrentAssets.fixedAssets.total}
              prev={previousBs.assets.nonCurrentAssets.fixedAssets.total}
            />
            <Row
              indent={2}
              letter="(b)"
              label="Non-current investments"
              curr={currentBs.assets.nonCurrentAssets.nonCurrentInvestments}
              prev={previousBs.assets.nonCurrentAssets.nonCurrentInvestments}
            />
            <Row
              indent={2}
              letter="(c)"
              label="Deferred tax assets (Net)"
              curr={currentBs.assets.nonCurrentAssets.deferredTaxAssets}
              prev={previousBs.assets.nonCurrentAssets.deferredTaxAssets}
            />
            <Row
              indent={2}
              letter="(d)"
              label="Long-term loans and advances"
              curr={currentBs.assets.nonCurrentAssets.longTermLoansAndAdvances}
              prev={previousBs.assets.nonCurrentAssets.longTermLoansAndAdvances}
            />
            <Row
              indent={2}
              letter="(e)"
              label="Other non-current assets"
              curr={currentBs.assets.nonCurrentAssets.otherNonCurrentAssets}
              prev={previousBs.assets.nonCurrentAssets.otherNonCurrentAssets}
            />
            <Subtotal
              indent={1}
              label="Non-current assets (Total)"
              curr={currentBs.assets.nonCurrentAssets.total}
              prev={previousBs.assets.nonCurrentAssets.total}
            />

            <SubHeader num="(2)" label="Current assets" />
            <Row
              indent={2}
              letter="(a)"
              label="Current investments"
              curr={currentBs.assets.currentAssets.currentInvestments}
              prev={previousBs.assets.currentAssets.currentInvestments}
            />
            <Row
              indent={2}
              letter="(b)"
              label="Inventories"
              curr={currentBs.assets.currentAssets.inventories}
              prev={previousBs.assets.currentAssets.inventories}
            />
            <Row
              indent={2}
              letter="(c)"
              label="Trade receivables"
              curr={currentBs.assets.currentAssets.tradeReceivables}
              prev={previousBs.assets.currentAssets.tradeReceivables}
            />
            <Row
              indent={2}
              letter="(d)"
              label="Cash and cash equivalents"
              curr={currentBs.assets.currentAssets.cashAndCashEquivalents}
              prev={previousBs.assets.currentAssets.cashAndCashEquivalents}
            />
            <Row
              indent={2}
              letter="(e)"
              label="Short-term loans and advances"
              curr={currentBs.assets.currentAssets.shortTermLoansAndAdvances}
              prev={previousBs.assets.currentAssets.shortTermLoansAndAdvances}
            />
            <Row
              indent={2}
              letter="(f)"
              label="Other current assets"
              curr={currentBs.assets.currentAssets.otherCurrentAssets}
              prev={previousBs.assets.currentAssets.otherCurrentAssets}
            />
            <Subtotal
              indent={1}
              label="Current assets (Total)"
              curr={currentBs.assets.currentAssets.total}
              prev={previousBs.assets.currentAssets.total}
            />

            <Subtotal
              indent={0}
              label="Total Assets"
              curr={currentBs.assets.total}
              prev={previousBs.assets.total}
              emphasize
            />
          </tbody>
        </table>

        <div className="text-xs text-muted-foreground px-6 py-4 flex items-center gap-2">
          ** Amount is displayed in your base currency
          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px] uppercase tracking-wider">
            {cur}
          </Badge>
        </div>
      </Card>
    </ReportShell>
  );
}

async function fetchBsInputs(
  organizationId: string,
  asOf: Date
): Promise<Sch3BsInput[]> {
  const [accounts, jeLines] = await Promise.all([
    db.chartOfAccount.findMany({
      where: {
        organizationId,
        isActive: true,
        type: { in: ["ASSET", "LIABILITY", "EQUITY"] },
      },
      select: { id: true, name: true, code: true, type: true, subType: true },
    }),
    db.journalEntryLine.findMany({
      where: {
        journalEntry: { organizationId, date: { lte: asOf } },
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
  const byId = new Map(ledger.map((r) => [r.accountId, r]));
  return accounts.map((a) => ({
    accountType: a.type as AccountBucket,
    accountName: a.name,
    accountSubType: a.subType,
    netBalance: byId.get(a.id)?.netBalance ?? 0,
  }));
}

function parseAsOf(s: string | undefined): Date | null {
  if (!s) return null;
  // Accept yyyy-MM-dd; treat as end-of-day in UTC for the SQL filter.
  const d = new Date(s + "T23:59:59Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-muted/30">
      <td colSpan={4} className="px-6 py-3 font-semibold uppercase tracking-wider text-sm">
        {label}
      </td>
    </tr>
  );
}
function SubHeader({ num, label }: { num: string; label: string }) {
  return (
    <tr>
      <td colSpan={4} className="px-6 py-2.5 pl-10 font-medium">
        <span className="text-muted-foreground mr-2">{num}</span>
        {label}
      </td>
    </tr>
  );
}
function SubHeader2({ letter, label }: { letter: string; label: string }) {
  return (
    <tr>
      <td colSpan={4} className="px-6 py-2 pl-16 font-medium text-sm">
        <span className="text-muted-foreground mr-2">{letter}</span>
        {label}
      </td>
    </tr>
  );
}

function Row({
  indent,
  letter,
  label,
  curr,
  prev,
}: {
  indent: number;
  letter?: string;
  label: string;
  curr: number;
  prev: number;
}) {
  const padLeft = `${1 + indent * 1.5}rem`;
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-6 py-2" style={{ paddingLeft: padLeft }}>
        {letter ? (
          <span className="text-muted-foreground mr-2">{letter}</span>
        ) : null}
        {label}
      </td>
      <td className="px-6 py-2 text-right text-xs text-muted-foreground"></td>
      <td
        className={
          "px-6 py-2 text-right tabular-nums " +
          (curr < 0 ? "text-destructive" : "")
        }
      >
        {fmt(curr)}
      </td>
      <td
        className={
          "px-6 py-2 text-right tabular-nums text-muted-foreground " +
          (prev < 0 ? "text-destructive" : "")
        }
      >
        {fmt(prev)}
      </td>
    </tr>
  );
}

function Subtotal({
  indent,
  label,
  curr,
  prev,
  emphasize,
}: {
  indent: number;
  label: string;
  curr: number;
  prev: number;
  emphasize?: boolean;
}) {
  const padLeft = `${1 + indent * 1.5}rem`;
  return (
    <tr className={emphasize ? "bg-muted/40" : "bg-muted/10"}>
      <td
        className="px-6 py-2.5 font-semibold"
        style={{ paddingLeft: padLeft }}
      >
        {label}
      </td>
      <td className="px-6 py-2.5 text-right text-xs text-muted-foreground"></td>
      <td
        className={
          "px-6 py-2.5 text-right tabular-nums font-semibold " +
          (curr < 0 ? "text-destructive" : "")
        }
      >
        {fmt(curr)}
      </td>
      <td
        className={
          "px-6 py-2.5 text-right tabular-nums font-semibold text-muted-foreground " +
          (prev < 0 ? "text-destructive" : "")
        }
      >
        {fmt(prev)}
      </td>
    </tr>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) < 0.005) return "0.00";
  const abs = Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${abs}` : abs;
}

// Reference Sch3BalanceSheet so the type-only import isn't flagged.
void (null as Sch3BalanceSheet | null);
