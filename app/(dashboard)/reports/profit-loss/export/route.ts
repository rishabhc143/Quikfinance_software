import { format } from "date-fns";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildProfitAndLoss,
  mergePnlWithCompare,
  type ProfitAndLoss,
  type PnlSection,
  type ProfitAndLossWithCompare,
  type PnlSectionWithCompare,
} from "@/lib/reports/profit-loss";
import {
  parseCompareMode,
  computeCompareRange,
  pctChange,
  formatPctChange,
} from "@/lib/reports/compare";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import { logReportActivity } from "@/lib/reports/activity";
import { renderProfitLossPdf } from "@/lib/reports/pdf/profit-loss";

/**
 * REPORTS — Export endpoint for the Zoho-style Profit and Loss page.
 *
 * Accepts:
 *   - `?format=csv` (default) or `?format=xlsx`
 *   - Same `?preset=…&from=…&to=…` shape the page reads, so the
 *     export window always matches what the user just looked at.
 *
 * The XLSX layout matches Zoho's downloaded P&L 1:1 — see
 * `buildXlsxZohoStyle` for the exact cell-by-cell spec.
 *
 * Filename: `profit-and-loss-{yyyymmdd}-to-{yyyymmdd}.csv` (or .xlsx).
 */
export async function GET(req: Request) {
  const { organization, user } = await requireOrganization();
  const url = new URL(req.url);
  const rawFmt = url.searchParams.get("format");
  const fmt: "csv" | "xlsx" | "pdf" =
    rawFmt === "pdf" ? "pdf" : rawFmt === "xlsx" ? "xlsx" : "csv";

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

  // ── Compare-period (only when ?compare=… is set + format is CSV
  // for now; XLSX/PDF still ship single-period exports).
  const compareMode = parseCompareMode(params);
  let pnlCompare: ProfitAndLossWithCompare | null = null;
  let prevRangeText: string | null = null;
  if (compareMode !== "none" && fmt === "csv") {
    const prevRange = computeCompareRange(range, compareMode);
    prevRangeText = `From ${format(prevRange.start, "dd/MM/yyyy")} To ${format(prevRange.end, "dd/MM/yyyy")}`;
    const prevJeLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: organization.id,
          date: { gte: prevRange.start, lte: prevRange.end },
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
    const prevLedger = aggregateLedgerLines(
      prevJeLines.map((l) => ({
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
    const prevPnl = buildProfitAndLoss(prevLedger);
    pnlCompare = mergePnlWithCompare(pnl, prevPnl);
  }

  const filenameStub = pnlCompare
    ? `profit-and-loss-${csvDateSuffix(range.start)}-to-${csvDateSuffix(range.end)}-vs-${compareMode}`
    : `profit-and-loss-${csvDateSuffix(range.start)}-to-${csvDateSuffix(range.end)}`;

  // Best-effort audit trail. Fire-and-forget — the helper swallows
  // its own errors, so a slow audit insert never blocks the download.
  void logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "profit-and-loss",
    eventType:
      fmt === "pdf"
        ? "EXPORT_PDF"
        : fmt === "xlsx"
          ? "EXPORT_XLSX"
          : "EXPORT_CSV",
    eventData: {
      format: fmt.toUpperCase() as "PDF" | "XLSX" | "CSV",
      filename: `${filenameStub}.${fmt}`,
    },
  });

  if (fmt === "pdf") {
    const dateRangeText = `From ${format(range.start, "dd/MM/yyyy")} To ${format(range.end, "dd/MM/yyyy")}`;
    const buf = await renderProfitLossPdf({
      organizationName: organization.name,
      dateRangeText,
      pnl,
      currency: organization.currency,
    });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameStub}.pdf"`,
      },
    });
  }
  if (fmt === "xlsx") {
    return buildXlsxZohoStyle(
      organization.name,
      range,
      pnl,
      filenameStub
    );
  }
  if (pnlCompare) {
    return buildCsvWithCompare(pnlCompare, filenameStub, prevRangeText);
  }
  return buildCsv(pnl, filenameStub);
}

// ─── CSV (back-compat — flat 3-column dump) ───────────────────────

function buildCsv(pnl: ProfitAndLoss, filenameStub: string): Response {
  const rows: CsvRow[] = [];
  function pushSection(s: PnlSection) {
    rows.push({ section: s.label, account: s.label, amount: "" });
    for (const a of s.accounts) {
      rows.push({
        section: s.label,
        account: a.accountCode
          ? `${a.accountCode} · ${a.accountName}`
          : a.accountName,
        amount: a.amount,
      });
    }
    rows.push({
      section: s.label,
      account: `Total for ${s.label}`,
      amount: s.total,
    });
  }
  pushSection(pnl.operatingIncome);
  pushSection(pnl.costOfGoodsSold);
  rows.push({ section: "Subtotal", account: "Gross Profit", amount: pnl.grossProfit });
  pushSection(pnl.operatingExpense);
  rows.push({ section: "Subtotal", account: "Operating Profit", amount: pnl.operatingProfit });
  pushSection(pnl.nonOperatingIncome);
  pushSection(pnl.nonOperatingExpense);
  rows.push({ section: "Subtotal", account: "Net Profit/Loss", amount: pnl.netProfitLoss });

  const csv = toCsv(rows, ["section", "account", "amount"]);
  return csvResponse(filenameStub, csv);
}

// ─── CSV with Compare columns ────────────────────────────────────

function buildCsvWithCompare(
  pnl: ProfitAndLossWithCompare,
  filenameStub: string,
  prevLabel: string | null
): Response {
  const rows: Record<string, string | number>[] = [];
  function pushSection(s: PnlSectionWithCompare) {
    rows.push({
      section: s.label,
      account: s.label,
      current: "",
      previous: "",
      change_pct: "",
    });
    for (const a of s.accounts) {
      rows.push({
        section: s.label,
        account: a.accountCode
          ? `${a.accountCode} · ${a.accountName}`
          : a.accountName,
        current: a.amount,
        previous: a.previousAmount,
        change_pct: formatPctChange(pctChange(a.amount, a.previousAmount)),
      });
    }
    rows.push({
      section: s.label,
      account: `Total for ${s.label}`,
      current: s.total,
      previous: s.previousTotal,
      change_pct: formatPctChange(pctChange(s.total, s.previousTotal)),
    });
  }
  pushSection(pnl.operatingIncome);
  pushSection(pnl.costOfGoodsSold);
  rows.push({
    section: "Subtotal",
    account: "Gross Profit",
    current: pnl.grossProfit,
    previous: pnl.previousGrossProfit,
    change_pct: formatPctChange(
      pctChange(pnl.grossProfit, pnl.previousGrossProfit)
    ),
  });
  pushSection(pnl.operatingExpense);
  rows.push({
    section: "Subtotal",
    account: "Operating Profit",
    current: pnl.operatingProfit,
    previous: pnl.previousOperatingProfit,
    change_pct: formatPctChange(
      pctChange(pnl.operatingProfit, pnl.previousOperatingProfit)
    ),
  });
  pushSection(pnl.nonOperatingIncome);
  pushSection(pnl.nonOperatingExpense);
  rows.push({
    section: "Subtotal",
    account: "Net Profit/Loss",
    current: pnl.netProfitLoss,
    previous: pnl.previousNetProfitLoss,
    change_pct: formatPctChange(
      pctChange(pnl.netProfitLoss, pnl.previousNetProfitLoss)
    ),
  });

  // Reference prevLabel so it's not flagged unused (could surface
  // as a CSV header comment in the future — for now the column
  // name "previous" + the filename suffix "-vs-previous-period"
  // already document the comparison window).
  void prevLabel;

  const csv = toCsv(
    rows as CsvRow[],
    ["section", "account", "current", "previous", "change_pct"]
  );
  return csvResponse(filenameStub, csv);
}

// ─── XLSX — Zoho-1:1 layout ───────────────────────────────────────

/**
 * Build the .xlsx file matching Zoho's downloaded P&L pixel-for-
 * pixel. The user's template (`Profit and Loss.xlsx`) is the
 * source-of-truth — fills, borders, column widths, the merged top +
 * bottom banners, and the **live Excel formulas** for Gross Profit /
 * Operating Profit / Net Profit/Loss are all faithful to it.
 *
 * Formulas reference the section-total rows by row number. Because
 * those rows can shift when accounts are listed under their section
 * header, we track each total's actual row number as we emit and
 * splice it back into the formula strings.
 */
async function buildXlsxZohoStyle(
  orgName: string,
  range: { start: Date; end: Date },
  pnl: ProfitAndLoss,
  filenameStub: string
): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quikfinance";
  wb.created = new Date();
  const ws = wb.addWorksheet("Profit and Loss");

  // Two columns, both ~39 chars wide (matches the template).
  ws.columns = [
    { key: "account", width: 39.0625 },
    { key: "total", width: 39.0625 },
  ];

  // ── Common style atoms ───────────────────────────────────────────
  const thin = { style: "thin" as const };
  const allBorders = {
    top: thin,
    bottom: thin,
    left: thin,
    right: thin,
  };
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
  const sectionHeaderFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFFFFFFF" },
  };

  // ── Row 1: merged banner with org / title / basis / dates ───────
  ws.mergeCells("A1:B1");
  const banner = ws.getCell("A1");
  banner.value =
    `${orgName}\n` +
    `            Profit and Loss\n` +
    `            Basis: Accrual\n` +
    `                        From ${format(range.start, "dd/MM/yyyy")} To ${format(range.end, "dd/MM/yyyy")}`;
  banner.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  banner.fill = bannerFill;
  banner.border = allBorders;
  banner.font = { size: 11, color: { argb: "FF000000" } };
  ws.getRow(1).height = 75;

  // ── Row 2: column headers ───────────────────────────────────────
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

  // Cursor starts on row 3 (the blank row above Operating Income
  // section header per the template). We'll always leave one blank
  // row between sections to match Zoho's spacing.
  let row = 3;
  ws.getRow(row).height = 8; // thin spacer
  row += 1;

  // Returns the row number of the "Total for <section>" line, which
  // the formulas reference.
  function emitSection(section: PnlSection): number {
    // Section header row.
    const headerRow = ws.getRow(row);
    const a = headerRow.getCell(1);
    const b = headerRow.getCell(2);
    a.value = section.label;
    b.value = "";
    for (const c of [a, b]) {
      c.fill = sectionHeaderFill;
      c.border = allBorders;
      c.font = { color: { argb: "FF000000" } };
    }
    a.alignment = { horizontal: "left" };
    row += 1;

    // Account rows (one per non-zero account in this section).
    for (const acct of section.accounts) {
      const accRow = ws.getRow(row);
      const ac = accRow.getCell(1);
      const am = accRow.getCell(2);
      ac.value = acct.accountCode
        ? `${acct.accountCode} · ${acct.accountName}`
        : acct.accountName;
      am.value = acct.amount;
      for (const c of [ac, am]) {
        c.fill = sectionHeaderFill;
        c.border = allBorders;
        c.font = { color: { argb: "FF000000" } };
      }
      ac.alignment = { horizontal: "left", indent: 1 };
      am.alignment = { horizontal: "right" };
      am.numFmt = "#,##0.00;-#,##0.00;0.00";
      row += 1;
    }

    // "Total for X" row — bold, gray, size 12.
    const totalRow = ws.getRow(row);
    const ta = totalRow.getCell(1);
    const tb = totalRow.getCell(2);
    ta.value = `Total for ${section.label}`;
    tb.value = section.total;
    for (const c of [ta, tb]) {
      c.fill = totalFill;
      c.border = allBorders;
      c.font = { bold: true, size: 12, color: { argb: "FF000000" } };
    }
    ta.alignment = { horizontal: "left" };
    tb.alignment = { horizontal: "right" };
    tb.numFmt = "#,##0.00;-#,##0.00;0.00";
    const totalRowNumber = row;
    row += 1;

    // One blank spacer row between sections.
    ws.getRow(row).height = 8;
    row += 1;

    return totalRowNumber;
  }

  // Emit sections + track their total-row numbers so the subtotal
  // formulas reference them correctly.
  const opIncomeTotalRow = emitSection(pnl.operatingIncome);
  const cogsTotalRow = emitSection(pnl.costOfGoodsSold);

  // Gross Profit subtotal — formula uses the tracked rows.
  emitSubtotal(
    "Gross Profit",
    `=(B${opIncomeTotalRow}-B${cogsTotalRow})`,
    pnl.grossProfit
  );

  const opExpenseTotalRow = emitSection(pnl.operatingExpense);

  // Operating Profit subtotal.
  emitSubtotal(
    "Operating Profit",
    `=((B${opIncomeTotalRow}-B${cogsTotalRow})-B${opExpenseTotalRow})`,
    pnl.operatingProfit
  );

  const nonOpIncomeTotalRow = emitSection(pnl.nonOperatingIncome);
  const nonOpExpenseTotalRow = emitSection(pnl.nonOperatingExpense);

  // Net Profit/Loss — full formula.
  emitSubtotal(
    "Net Profit/Loss",
    `=(((B${opIncomeTotalRow}-B${cogsTotalRow})-B${opExpenseTotalRow})+B${nonOpIncomeTotalRow}-B${nonOpExpenseTotalRow})`,
    pnl.netProfitLoss
  );

  // Final merged banner row (matches the template's A24:B24 row).
  ws.mergeCells(`A${row}:B${row}`);
  const footer = ws.getCell(`A${row}`);
  footer.value = "";
  footer.fill = bannerFill;
  footer.border = allBorders;
  footer.alignment = { horizontal: "center" };
  ws.getRow(row).height = 8;

  function emitSubtotal(label: string, formula: string, value: number) {
    const subRow = ws.getRow(row);
    const a = subRow.getCell(1);
    const b = subRow.getCell(2);
    a.value = label;
    // exceljs accepts an object for formula cells. Provide `result`
    // so the file opens with the right pre-computed display value
    // (otherwise Excel might show 0 until the user hits "calculate").
    b.value = { formula: formula.replace(/^=/, ""), result: value };
    for (const c of [a, b]) {
      c.fill = totalFill;
      c.border = allBorders;
      c.font = { bold: true, size: 12, color: { argb: "FF000000" } };
    }
    a.alignment = { horizontal: "right" };
    b.alignment = { horizontal: "right" };
    b.numFmt = "#,##0.00;-#,##0.00;0.00";
    row += 1;

    // Spacer row between subtotals + the next section.
    ws.getRow(row).height = 8;
    row += 1;
  }

  // ─── Serialize + respond ────────────────────────────────────────
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
