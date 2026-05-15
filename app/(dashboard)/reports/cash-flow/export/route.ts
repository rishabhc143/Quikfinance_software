import { format } from "date-fns";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildCashFlowStatement,
  isCashAccount,
  type CashFlowAccountDelta,
  type CashFlowStatement,
} from "@/lib/reports/cash-flow";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";

/**
 * REPORTS — Export endpoint for the Zoho-style Cash Flow Statement.
 *
 *   ?format=csv  (default) — flat list of section / line / amount
 *   ?format=xlsx           — Zoho-style banner, borders, grey
 *                            fills, bold subtotals on grey #F5F5F5
 *
 * Filter: same `?preset=…&from=…&to=…` shape as the page.
 *
 * Filename: cash-flow-{yyyymmdd}-to-{yyyymmdd}.csv (or .xlsx).
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

  const accounts = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      subType: true,
    },
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const cashAccountIds = accounts
    .filter((a) => isCashAccount(a.type as AccountBucket, a.subType))
    .map((a) => a.id);

  const [beforeLines, periodLines] = await Promise.all([
    cashAccountIds.length > 0
      ? db.journalEntryLine.findMany({
          where: {
            accountId: { in: cashAccountIds },
            journalEntry: {
              organizationId: organization.id,
              date: { lt: range.start },
            },
          },
          select: { debit: true, credit: true, accountId: true },
        })
      : Promise.resolve(
          [] as Array<{ debit: unknown; credit: unknown; accountId: string }>
        ),
    db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: organization.id,
          date: { gte: range.start, lte: range.end },
        },
      },
      select: {
        debit: true,
        credit: true,
        account: {
          select: { id: true, name: true, code: true, type: true },
        },
      },
    }),
  ]);

  const beginningCashBalance = beforeLines.reduce(
    (s, l) => s + Number(l.debit) - Number(l.credit),
    0
  );
  const ledger = aggregateLedgerLines(
    periodLines.map((l) => ({
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

  let netIncome = 0;
  for (const r of ledger) {
    if (r.accountType === "INCOME" || r.accountType === "OTHER_INCOME") {
      netIncome += r.totalCredit - r.totalDebit;
    } else if (
      r.accountType === "EXPENSE" ||
      r.accountType === "COST_OF_GOODS_SOLD" ||
      r.accountType === "OTHER_EXPENSE"
    ) {
      netIncome -= r.totalDebit - r.totalCredit;
    }
  }

  const nonCashDeltas: CashFlowAccountDelta[] = ledger
    .filter((r) => {
      if (
        r.accountType === "INCOME" ||
        r.accountType === "OTHER_INCOME" ||
        r.accountType === "EXPENSE" ||
        r.accountType === "COST_OF_GOODS_SOLD" ||
        r.accountType === "OTHER_EXPENSE"
      ) {
        return false;
      }
      const a = accountById.get(r.accountId);
      if (!a) return false;
      return !isCashAccount(a.type as AccountBucket, a.subType);
    })
    .map((r) => {
      const a = accountById.get(r.accountId)!;
      return {
        accountId: r.accountId,
        accountName: r.accountName,
        accountCode: r.accountCode,
        accountType: a.type as AccountBucket,
        accountSubType: a.subType,
        rawDelta: r.totalDebit - r.totalCredit,
      };
    });

  const cashPeriodDelta = ledger
    .filter((r) => {
      const a = accountById.get(r.accountId);
      return a ? isCashAccount(a.type as AccountBucket, a.subType) : false;
    })
    .reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);
  const endingCashBalance = beginningCashBalance + cashPeriodDelta;

  const cf = buildCashFlowStatement({
    beginningCashBalance,
    endingCashBalance,
    netIncome,
    nonCashDeltas,
  });
  const filenameStub = `cash-flow-${csvDateSuffix(range.start)}-to-${csvDateSuffix(range.end)}`;

  if (fmt === "xlsx") {
    return buildXlsx(organization.name, range, cf, filenameStub);
  }
  return buildCsv(cf, filenameStub);
}

function buildCsv(cf: CashFlowStatement, filenameStub: string): Response {
  const rows: CsvRow[] = [];
  rows.push({
    section: "Cash Balances",
    line: "Beginning Cash Balance",
    amount: cf.beginningCashBalance,
  });
  rows.push({ section: "Operating", line: "Net Income", amount: cf.operating.netIncome });
  rows.push({
    section: "Operating",
    line: "Non-cash adjustments",
    amount: "",
  });
  for (const a of cf.operating.nonCashAdjustments) {
    rows.push({ section: "Operating", line: a.label, amount: a.amount });
  }
  rows.push({
    section: "Operating",
    line: "Non-cash adjustments Total",
    amount: cf.operating.nonCashAdjustmentsTotal,
  });
  rows.push({
    section: "Operating",
    line: "Net cash provided by Operating Activities",
    amount: cf.operating.netCashFromOperating,
  });
  for (const i of cf.investing.items) {
    rows.push({ section: "Investing", line: i.label, amount: i.amount });
  }
  rows.push({
    section: "Investing",
    line: "Net cash provided by Investing Activities",
    amount: cf.investing.netCashFromInvesting,
  });
  for (const i of cf.financing.items) {
    rows.push({ section: "Financing", line: i.label, amount: i.amount });
  }
  rows.push({
    section: "Financing",
    line: "Net cash provided by Financing Activities",
    amount: cf.financing.netCashFromFinancing,
  });
  rows.push({ section: "Summary", line: "Net Change in cash", amount: cf.netChangeInCash });
  rows.push({
    section: "Summary",
    line: "Ending Cash Balance",
    amount: cf.endingCashBalance,
  });
  const csv = toCsv(rows, ["section", "line", "amount"]);
  return csvResponse(filenameStub, csv);
}

async function buildXlsx(
  orgName: string,
  range: { start: Date; end: Date },
  cf: CashFlowStatement,
  filenameStub: string
): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quikfinance";
  wb.created = new Date();
  const ws = wb.addWorksheet("Cash Flow Statement");

  ws.columns = [
    { key: "account", width: 50 },
    { key: "total", width: 20 },
  ];

  const thin = { style: "thin" as const };
  const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
  const bannerFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFEEEEEE" },
  };
  const totalFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFF5F5F5" },
  };
  const sectionFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFFFFFFF" },
  };
  const moneyFmt = "#,##0.00;-#,##0.00;0.00";

  // Banner.
  ws.mergeCells("A1:B1");
  const banner = ws.getCell("A1");
  banner.value =
    `${orgName}\n` +
    `            Cash Flow Statement\n` +
    `                        From ${format(range.start, "dd/MM/yyyy")} To ${format(range.end, "dd/MM/yyyy")}`;
  banner.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  banner.fill = bannerFill;
  banner.border = allBorders;
  banner.font = { size: 11, color: { argb: "FF000000" } };
  ws.getRow(1).height = 60;

  const h1 = ws.getCell("A2");
  const h2 = ws.getCell("B2");
  h1.value = "Account ";
  h2.value = "Total ";
  for (const c of [h1, h2]) {
    c.fill = totalFill;
    c.border = allBorders;
    c.font = { color: { argb: "FF000000" } };
  }
  h1.alignment = { horizontal: "left" };
  h2.alignment = { horizontal: "right" };

  let row = 3;
  ws.getRow(row).height = 8;
  row += 1;

  function emit(
    label: string,
    amount: number | null,
    opts: {
      indent?: number;
      bold?: boolean;
      fill?: "section" | "total";
      sizeUp?: boolean;
    }
  ) {
    const r = ws.getRow(row);
    const a = r.getCell(1);
    const b = r.getCell(2);
    a.value = (opts.indent ? "    ".repeat(opts.indent) : "") + label;
    b.value = amount;
    const fill = opts.fill === "total" ? totalFill : sectionFill;
    for (const c of [a, b]) {
      c.fill = fill;
      c.border = allBorders;
      c.font = {
        bold: !!opts.bold,
        size: opts.sizeUp ? 12 : 11,
        color: { argb: "FF000000" },
      };
    }
    a.alignment = { horizontal: "left" };
    b.alignment = { horizontal: "right" };
    if (amount !== null) b.numFmt = moneyFmt;
    row += 1;
  }

  emit("Beginning Cash Balance", cf.beginningCashBalance, {
    bold: true,
    fill: "total",
    sizeUp: true,
  });

  emit("Cash Flow from Operating Activities", null, {
    bold: true,
    sizeUp: true,
    fill: "section",
  });
  emit("Net Income", cf.operating.netIncome, { indent: 1, fill: "section" });
  emit("Non-cash adjustments", null, {
    indent: 1,
    bold: true,
    fill: "section",
  });
  for (const adj of cf.operating.nonCashAdjustments) {
    emit(adj.label, adj.amount, { indent: 2, fill: "section" });
  }
  emit("Non-cash adjustments Total", cf.operating.nonCashAdjustmentsTotal, {
    indent: 1,
    bold: true,
    fill: "total",
    sizeUp: true,
  });
  emit(
    "Net cash provided by Operating Activities",
    cf.operating.netCashFromOperating,
    { bold: true, fill: "total", sizeUp: true }
  );

  emit("Cash Flow from Investing Activities", null, {
    bold: true,
    sizeUp: true,
    fill: "section",
  });
  for (const it of cf.investing.items) {
    emit(it.label, it.amount, { indent: 1, fill: "section" });
  }
  emit(
    "Net cash provided by Investing Activities",
    cf.investing.netCashFromInvesting,
    { bold: true, fill: "total", sizeUp: true }
  );

  emit("Cash Flow from Financing Activities", null, {
    bold: true,
    sizeUp: true,
    fill: "section",
  });
  for (const it of cf.financing.items) {
    emit(it.label, it.amount, { indent: 1, fill: "section" });
  }
  emit(
    "Net cash provided by Financing Activities",
    cf.financing.netCashFromFinancing,
    { bold: true, fill: "total", sizeUp: true }
  );

  emit("Net Change in cash", cf.netChangeInCash, {
    bold: true,
    fill: "total",
    sizeUp: true,
  });
  emit("Ending Cash Balance", cf.endingCashBalance, {
    bold: true,
    fill: "total",
    sizeUp: true,
  });

  ws.mergeCells(`A${row}:B${row}`);
  const footer = ws.getCell(`A${row}`);
  footer.value = "";
  footer.fill = bannerFill;
  footer.border = allBorders;
  footer.alignment = { horizontal: "center" };
  ws.getRow(row).height = 8;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const buf = Buffer.from(arrayBuffer);
  const safe = filenameStub.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}.xlsx"`,
      "Cache-Control": "no-store",
      "Content-Length": String(buf.byteLength),
    },
  });
}
