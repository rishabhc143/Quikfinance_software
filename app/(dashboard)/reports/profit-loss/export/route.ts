import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildProfitAndLoss,
  type ProfitAndLoss,
  type PnlSection,
} from "@/lib/reports/profit-loss";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import {
  toXlsx,
  xlsxResponse,
  XLSX_FMT,
  type XlsxRow,
  type XlsxColumn,
} from "@/lib/reports/xlsx-export";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";

/**
 * REPORTS — Export endpoint for the Zoho-style Profit and Loss page.
 *
 * Accepts:
 *   - `?format=csv` (default) or `?format=xlsx`
 *   - Same `?preset=…&from=…&to=…` shape the page reads, so the
 *     export window always matches what the user just looked at.
 *
 * Filename: `profit-and-loss-{yyyymmdd}-to-{yyyymmdd}.csv` (or .xlsx).
 */
export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const url = new URL(req.url);
  const fmt = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const params = Object.fromEntries(url.searchParams.entries());
  const { range } = parseRangeFromSearchParams(params, {
    fiscalYearStartMonth: organization.fiscalYearStart,
    defaultPreset: "this-month",
  });

  const jeLines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        organizationId: organization.id,
        date: { gte: range.start, lte: range.end },
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
  const filenameStub = `profit-and-loss-${csvDateSuffix(range.start)}-to-${csvDateSuffix(range.end)}`;

  if (fmt === "xlsx") {
    return buildXlsx(organization.name, organization.currency, range, pnl, filenameStub);
  }
  return buildCsv(pnl, filenameStub);
}

/**
 * Flatten the P&L structure into a row list shared by both export
 * formats. Each row carries a `section` label (for grouping in CSV)
 * and an `account` + `amount` pair. Subtotal rows use a sentinel
 * `kind: "subtotal"` so the XLSX builder can bold them.
 */
type FlatRow = {
  section: string;
  account: string;
  amount: number;
  kind: "header" | "account" | "section-total" | "subtotal";
};

function flatten(pnl: ProfitAndLoss): FlatRow[] {
  const out: FlatRow[] = [];

  function pushSection(s: PnlSection) {
    out.push({
      section: s.label,
      account: s.label,
      amount: 0,
      kind: "header",
    });
    for (const a of s.accounts) {
      out.push({
        section: s.label,
        account: a.accountCode ? `${a.accountCode} · ${a.accountName}` : a.accountName,
        amount: a.amount,
        kind: "account",
      });
    }
    out.push({
      section: s.label,
      account: `Total for ${s.label}`,
      amount: s.total,
      kind: "section-total",
    });
  }

  pushSection(pnl.operatingIncome);
  pushSection(pnl.costOfGoodsSold);
  out.push({
    section: "Subtotal",
    account: "Gross Profit",
    amount: pnl.grossProfit,
    kind: "subtotal",
  });
  pushSection(pnl.operatingExpense);
  out.push({
    section: "Subtotal",
    account: "Operating Profit",
    amount: pnl.operatingProfit,
    kind: "subtotal",
  });
  pushSection(pnl.nonOperatingIncome);
  pushSection(pnl.nonOperatingExpense);
  out.push({
    section: "Subtotal",
    account: "Net Profit/Loss",
    amount: pnl.netProfitLoss,
    kind: "subtotal",
  });

  return out;
}

function buildCsv(pnl: ProfitAndLoss, filenameStub: string): Response {
  // CSV keeps it simple — section / account / amount. Header rows
  // get an empty amount so spreadsheets don't sum them by accident.
  const rows: CsvRow[] = flatten(pnl).map((r) => ({
    section: r.section,
    account: r.account,
    amount: r.kind === "header" ? "" : r.amount,
  }));
  const csv = toCsv(rows, ["section", "account", "amount"]);
  return csvResponse(filenameStub, csv);
}

async function buildXlsx(
  orgName: string,
  currency: string,
  range: { start: Date; end: Date },
  pnl: ProfitAndLoss,
  filenameStub: string
): Promise<Response> {
  const columns: XlsxColumn[] = [
    { key: "section", header: "Section", width: 24 },
    { key: "account", header: "Account", width: 44 },
    { key: "amount", header: `Amount (${currency})`, width: 18, numFmt: XLSX_FMT.moneyZeroDash },
  ];

  // Prepend a few context rows above the data so the file opens
  // self-describing (org / report / period / basis).
  const flat = flatten(pnl);
  const rows: XlsxRow[] = [
    { section: "", account: orgName, amount: null },
    { section: "", account: "Profit and Loss", amount: null },
    { section: "", account: `Basis: Accrual`, amount: null },
    {
      section: "",
      account: `From ${format(range.start, "dd/MM/yyyy")} To ${format(range.end, "dd/MM/yyyy")}`,
      amount: null,
    },
    { section: "", account: "", amount: null },
    ...flat.map((r) => ({
      section: r.section,
      account: r.account,
      amount: r.kind === "header" ? null : r.amount,
    })),
  ];

  const buf = await toXlsx({
    sheetName: "Profit and Loss",
    columns,
    rows,
  });
  return xlsxResponse(filenameStub, buf);
}
