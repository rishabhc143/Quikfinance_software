import { format, subMonths, endOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildScheduleIIIBalanceSheet,
  type Sch3BsInput,
} from "@/lib/reports/balance-sheet-schedule-iii";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import { logReportActivity } from "@/lib/reports/activity";

/**
 * REPORTS — CSV export for Balance Sheet (Schedule III).
 * XLSX + PDF queued as follow-ups.
 */
export async function GET(req: Request) {
  const { organization, user } = await requireOrganization();
  const url = new URL(req.url);

  const asOf = parseAsOf(url.searchParams.get("as_of")) ?? endOfDay(new Date());
  const previousAsOf = endOfDay(subMonths(asOf, 1));

  const [currentInputs, previousInputs] = await Promise.all([
    fetchBsInputs(organization.id, asOf),
    fetchBsInputs(organization.id, previousAsOf),
  ]);
  const currentBs = buildScheduleIIIBalanceSheet(currentInputs);
  const previousBs = buildScheduleIIIBalanceSheet(previousInputs);

  const currentLabel = `As of ${format(asOf, "dd MMM yyyy")}`;
  const previousLabel = `As of ${format(previousAsOf, "dd MMM yyyy")}`;
  const filenameStub = `balance-sheet-schedule-iii-as-of-${csvDateSuffix(asOf)}`;

  void logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "balance-sheet-schedule-iii",
    eventType: "EXPORT_CSV",
    eventData: { format: "CSV", filename: `${filenameStub}.csv` },
  });

  const rows: CsvRow[] = [
    { particulars: "Particulars", current: currentLabel, previous: previousLabel },
    // I. Equity & Liabilities
    head("I. EQUITY AND LIABILITIES"),
    head("(1) Shareholders' Funds"),
    sub("    (a) Share Capital", currentBs.equityAndLiabilities.shareholdersFunds.shareCapital, previousBs.equityAndLiabilities.shareholdersFunds.shareCapital),
    sub("    (b) Reserves and Surplus", currentBs.equityAndLiabilities.shareholdersFunds.reservesAndSurplus, previousBs.equityAndLiabilities.shareholdersFunds.reservesAndSurplus),
    sub("    (c) Money received against share warrants", currentBs.equityAndLiabilities.shareholdersFunds.moneyAgainstShareWarrants, previousBs.equityAndLiabilities.shareholdersFunds.moneyAgainstShareWarrants),
    sub("Shareholders' Funds (Total)", currentBs.equityAndLiabilities.shareholdersFunds.total, previousBs.equityAndLiabilities.shareholdersFunds.total),
    sub("(2) Share application money pending allotment", currentBs.equityAndLiabilities.shareApplicationPending, previousBs.equityAndLiabilities.shareApplicationPending),
    head("(3) Non-Current Liabilities"),
    sub("    (a) Long-term borrowings", currentBs.equityAndLiabilities.nonCurrentLiabilities.longTermBorrowings, previousBs.equityAndLiabilities.nonCurrentLiabilities.longTermBorrowings),
    sub("    (b) Deferred tax liabilities (Net)", currentBs.equityAndLiabilities.nonCurrentLiabilities.deferredTaxLiabilities, previousBs.equityAndLiabilities.nonCurrentLiabilities.deferredTaxLiabilities),
    sub("    (c) Other Long term liabilities", currentBs.equityAndLiabilities.nonCurrentLiabilities.otherLongTermLiabilities, previousBs.equityAndLiabilities.nonCurrentLiabilities.otherLongTermLiabilities),
    sub("    (d) Long term provisions", currentBs.equityAndLiabilities.nonCurrentLiabilities.longTermProvisions, previousBs.equityAndLiabilities.nonCurrentLiabilities.longTermProvisions),
    sub("Non-Current Liabilities (Total)", currentBs.equityAndLiabilities.nonCurrentLiabilities.total, previousBs.equityAndLiabilities.nonCurrentLiabilities.total),
    head("(4) Current Liabilities"),
    sub("    (a) Short-term borrowings", currentBs.equityAndLiabilities.currentLiabilities.shortTermBorrowings, previousBs.equityAndLiabilities.currentLiabilities.shortTermBorrowings),
    sub("    (b) Trade payables", currentBs.equityAndLiabilities.currentLiabilities.tradePayables, previousBs.equityAndLiabilities.currentLiabilities.tradePayables),
    sub("    (c) Other current liabilities", currentBs.equityAndLiabilities.currentLiabilities.otherCurrentLiabilities, previousBs.equityAndLiabilities.currentLiabilities.otherCurrentLiabilities),
    sub("    (d) Short-term provisions", currentBs.equityAndLiabilities.currentLiabilities.shortTermProvisions, previousBs.equityAndLiabilities.currentLiabilities.shortTermProvisions),
    sub("Current Liabilities (Total)", currentBs.equityAndLiabilities.currentLiabilities.total, previousBs.equityAndLiabilities.currentLiabilities.total),
    sub("Total Equity and Liabilities", currentBs.equityAndLiabilities.total, previousBs.equityAndLiabilities.total),
    // II. Assets
    head("II. ASSETS"),
    head("(1) Non-current assets"),
    head("    (a) Fixed assets"),
    sub("        (i) Tangible assets", currentBs.assets.nonCurrentAssets.fixedAssets.tangibleAssets, previousBs.assets.nonCurrentAssets.fixedAssets.tangibleAssets),
    sub("        (ii) Intangible assets", currentBs.assets.nonCurrentAssets.fixedAssets.intangibleAssets, previousBs.assets.nonCurrentAssets.fixedAssets.intangibleAssets),
    sub("        (iii) Capital work-in-progress", currentBs.assets.nonCurrentAssets.fixedAssets.capitalWorkInProgress, previousBs.assets.nonCurrentAssets.fixedAssets.capitalWorkInProgress),
    sub("        (iv) Intangible assets under development", currentBs.assets.nonCurrentAssets.fixedAssets.intangibleAssetsUnderDevelopment, previousBs.assets.nonCurrentAssets.fixedAssets.intangibleAssetsUnderDevelopment),
    sub("    Fixed assets (Total)", currentBs.assets.nonCurrentAssets.fixedAssets.total, previousBs.assets.nonCurrentAssets.fixedAssets.total),
    sub("    (b) Non-current investments", currentBs.assets.nonCurrentAssets.nonCurrentInvestments, previousBs.assets.nonCurrentAssets.nonCurrentInvestments),
    sub("    (c) Deferred tax assets (Net)", currentBs.assets.nonCurrentAssets.deferredTaxAssets, previousBs.assets.nonCurrentAssets.deferredTaxAssets),
    sub("    (d) Long-term loans and advances", currentBs.assets.nonCurrentAssets.longTermLoansAndAdvances, previousBs.assets.nonCurrentAssets.longTermLoansAndAdvances),
    sub("    (e) Other non-current assets", currentBs.assets.nonCurrentAssets.otherNonCurrentAssets, previousBs.assets.nonCurrentAssets.otherNonCurrentAssets),
    sub("Non-current assets (Total)", currentBs.assets.nonCurrentAssets.total, previousBs.assets.nonCurrentAssets.total),
    head("(2) Current assets"),
    sub("    (a) Current investments", currentBs.assets.currentAssets.currentInvestments, previousBs.assets.currentAssets.currentInvestments),
    sub("    (b) Inventories", currentBs.assets.currentAssets.inventories, previousBs.assets.currentAssets.inventories),
    sub("    (c) Trade receivables", currentBs.assets.currentAssets.tradeReceivables, previousBs.assets.currentAssets.tradeReceivables),
    sub("    (d) Cash and cash equivalents", currentBs.assets.currentAssets.cashAndCashEquivalents, previousBs.assets.currentAssets.cashAndCashEquivalents),
    sub("    (e) Short-term loans and advances", currentBs.assets.currentAssets.shortTermLoansAndAdvances, previousBs.assets.currentAssets.shortTermLoansAndAdvances),
    sub("    (f) Other current assets", currentBs.assets.currentAssets.otherCurrentAssets, previousBs.assets.currentAssets.otherCurrentAssets),
    sub("Current assets (Total)", currentBs.assets.currentAssets.total, previousBs.assets.currentAssets.total),
    sub("Total Assets", currentBs.assets.total, previousBs.assets.total),
  ];

  return csvResponse(`${filenameStub}.csv`, toCsv(rows));
}

function head(label: string): CsvRow {
  return { particulars: label, current: "", previous: "" };
}
function sub(label: string, c: number, p: number): CsvRow {
  return { particulars: label, current: c, previous: p };
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

function parseAsOf(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T23:59:59Z");
  return Number.isNaN(d.getTime()) ? null : d;
}
