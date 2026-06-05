import "server-only";

/**
 * CF-4 — Export the cashflow forecast as a .xlsx workbook.
 *
 * Three sheets per file:
 *   1. "Summary" — headline numbers (starting / ending / net / min)
 *      + the scenario the file was generated under.
 *   2. "Weekly" — 12 rows, one per week, with totals + running
 *      balance + deficit flag.
 *   3. "Daily" — 84 rows, one per forecast day, full granularity.
 *   4. "Items" — every individual inflow / outflow placement so the
 *      user can trace every figure back to its source invoice / bill
 *      / recurring profile.
 *
 * Uses ExcelJS directly (rather than `lib/reports/xlsx-export.ts`'s
 * single-sheet helper) because the forecast inherently spans
 * multiple sheets with different schemas.
 */

import ExcelJS from "exceljs";
import { format, parseISO } from "date-fns";
import type { CashflowForecast } from "./types";

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE5E7EB" }, // tailwind gray-200
};

const FMT = {
  money: "#,##0.00;[Red](#,##0.00);-",
  integer: "#,##0",
  dateLong: "dd mmm yyyy",
};

export async function buildForecastWorkbook(
  forecast: CashflowForecast,
  organizationName: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quikfinance";
  wb.created = new Date();

  buildSummarySheet(wb, forecast, organizationName);
  buildWeeklySheet(wb, forecast);
  buildDailySheet(wb, forecast);
  buildItemsSheet(wb, forecast);

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  forecast: CashflowForecast,
  organizationName: string
) {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [
    { key: "label", width: 38 },
    { key: "value", width: 28 },
  ];

  const s = forecast.summary;
  const rows: Array<[string, ExcelJS.CellValue, string?]> = [
    ["Organization", organizationName],
    ["Generated", new Date(), FMT.dateLong],
    [
      "Forecast horizon",
      `${format(parseISO(forecast.startDate), "d MMM yyyy")} → ${format(parseISO(forecast.endDate), "d MMM yyyy")} (${forecast.horizonDays} days)`,
    ],
    [
      "Scenario",
      forecast.stressDays > 0
        ? `Stress test: +${forecast.stressDays} days delay on all customer inflows`
        : "Base case (no stress applied)",
    ],
    ["Currency", forecast.currency],
    ["", ""],
    ["Starting balance", s.startingBalance, FMT.money],
    ["Projected ending balance", s.endingBalance, FMT.money],
    ["Total inflows (12 weeks)", s.totalInflows, FMT.money],
    ["Total outflows (12 weeks)", s.totalOutflows, FMT.money],
    ["Net cashflow", s.netCashflow, FMT.money],
    ["", ""],
    ["Minimum running balance", s.minBalance, FMT.money],
    [
      "Minimum balance date",
      s.minBalanceDate
        ? format(parseISO(s.minBalanceDate), "d MMM yyyy")
        : "—",
    ],
    ["Weeks with deficit", s.weeksWithDeficit, FMT.integer],
    ["Items shifted by learned delay", s.patternsApplied, FMT.integer],
    ["Insolvency risk flagged", s.hasInsolvencyRisk ? "YES" : "No"],
  ];

  for (const [label, value, numFmt] of rows) {
    const row = ws.addRow({ label, value });
    row.getCell("label").font = { bold: true };
    if (numFmt) row.getCell("value").numFmt = numFmt;
  }

  // Title row
  ws.spliceRows(1, 0, ["12-Week Cashflow Forecast"]);
  const title = ws.getRow(1);
  title.font = { bold: true, size: 14 };
  ws.mergeCells("A1:B1");

  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function buildWeeklySheet(wb: ExcelJS.Workbook, forecast: CashflowForecast) {
  const ws = wb.addWorksheet("Weekly");
  ws.columns = [
    { header: "Week #", key: "weekNum", width: 8 },
    { header: "Week start", key: "weekStart", width: 14 },
    { header: "Week end", key: "weekEnd", width: 14 },
    { header: "Inflows", key: "inflows", width: 16, style: { numFmt: FMT.money } },
    { header: "Outflows", key: "outflows", width: 16, style: { numFmt: FMT.money } },
    { header: "Net", key: "net", width: 16, style: { numFmt: FMT.money } },
    {
      header: "Ending balance",
      key: "endingBalance",
      width: 18,
      style: { numFmt: FMT.money },
    },
    {
      header: "Min balance",
      key: "minBalance",
      width: 16,
      style: { numFmt: FMT.money },
    },
    { header: "Status", key: "status", width: 14 },
  ];

  applyHeaderStyle(ws);

  forecast.weeks.forEach((w, idx) => {
    const insolvent = w.minBalance < 0;
    const deficit = w.net < 0;
    ws.addRow({
      weekNum: idx + 1,
      weekStart: format(parseISO(w.weekStart), "d MMM yyyy"),
      weekEnd: format(parseISO(w.weekEnd), "d MMM yyyy"),
      inflows: w.totalIn,
      outflows: w.totalOut,
      net: w.net,
      endingBalance: w.endingBalance,
      minBalance: w.minBalance,
      status: insolvent ? "Below zero" : deficit ? "Deficit" : "Surplus",
    });
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function buildDailySheet(wb: ExcelJS.Workbook, forecast: CashflowForecast) {
  const ws = wb.addWorksheet("Daily");
  ws.columns = [
    { header: "Date", key: "date", width: 14 },
    {
      header: "Inflows",
      key: "totalIn",
      width: 14,
      style: { numFmt: FMT.money },
    },
    {
      header: "Outflows",
      key: "totalOut",
      width: 14,
      style: { numFmt: FMT.money },
    },
    { header: "Net", key: "net", width: 14, style: { numFmt: FMT.money } },
    {
      header: "Running balance",
      key: "runningBalance",
      width: 18,
      style: { numFmt: FMT.money },
    },
    {
      header: "Items in",
      key: "itemsIn",
      width: 9,
      style: { numFmt: FMT.integer },
    },
    {
      header: "Items out",
      key: "itemsOut",
      width: 9,
      style: { numFmt: FMT.integer },
    },
  ];

  applyHeaderStyle(ws);

  for (const d of forecast.days) {
    ws.addRow({
      date: format(parseISO(d.date), "d MMM yyyy"),
      totalIn: d.totalIn,
      totalOut: d.totalOut,
      net: d.net,
      runningBalance: d.runningBalance,
      itemsIn: d.inflows.length,
      itemsOut: d.outflows.length,
    });
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function buildItemsSheet(wb: ExcelJS.Workbook, forecast: CashflowForecast) {
  const ws = wb.addWorksheet("Items");
  ws.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Direction", key: "direction", width: 10 },
    { header: "Source", key: "source", width: 22 },
    { header: "Label", key: "label", width: 50 },
    {
      header: "Amount",
      key: "amount",
      width: 14,
      style: { numFmt: FMT.money },
    },
    { header: "Original due date", key: "originalDate", width: 16 },
    {
      header: "Delay applied (days)",
      key: "delayAppliedDays",
      width: 18,
      style: { numFmt: FMT.integer },
    },
  ];

  applyHeaderStyle(ws);

  for (const d of forecast.days) {
    for (const it of d.inflows) {
      ws.addRow({
        date: format(parseISO(d.date), "d MMM yyyy"),
        direction: "Inflow",
        source: humanizeSource(it.source),
        label: it.label,
        amount: it.amount,
        originalDate: it.originalDate
          ? format(parseISO(it.originalDate), "d MMM yyyy")
          : "",
        delayAppliedDays: it.delayAppliedDays ?? "",
      });
    }
    for (const it of d.outflows) {
      ws.addRow({
        date: format(parseISO(d.date), "d MMM yyyy"),
        direction: "Outflow",
        source: humanizeSource(it.source),
        label: it.label,
        amount: it.amount,
        originalDate: it.originalDate
          ? format(parseISO(it.originalDate), "d MMM yyyy")
          : "",
        delayAppliedDays: it.delayAppliedDays ?? "",
      });
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function humanizeSource(s: string): string {
  switch (s) {
    case "invoice":
      return "Open invoice";
    case "bill":
      return "Open bill";
    case "recurring-invoice":
      return "Recurring invoice";
    case "recurring-bill":
      return "Recurring bill";
    case "recurring-expense":
      return "Recurring expense";
    default:
      return s;
  }
}

function applyHeaderStyle(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: "middle" };
}
