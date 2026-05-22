import { format, parse, isValid } from "date-fns";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import {
  buildTrialBalance,
  type TrialBalance,
} from "@/lib/reports/trial-balance";
import { renderTrialBalancePdf } from "@/lib/reports/pdf/trial-balance";
import { logReportActivity } from "@/lib/reports/activity";
import { parseReportBasis, REPORT_BASIS_LABEL } from "@/lib/reports/report-basis";

/**
 * RPT-TB — Trial Balance CSV / XLSX / PDF export.
 *
 * Shares filter parsing with the page so the user gets exactly what
 * they see on screen. Every export call writes a ReportActivity row
 * so the Activity drawer reflects user actions.
 */
export async function GET(req: Request) {
  const { organization, user } = await requireOrganization();
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const fmt: "csv" | "xlsx" | "pdf" = parseFormat(searchParams.get("format"));
  const asOf = parseAsOf(searchParams.get("asOf"));
  const params = Object.fromEntries(searchParams.entries());
  const basis = parseReportBasis(params);
  const cols = {
    accountCode: searchParams.get("showAccountCode") !== "0" && searchParams.get("showAccountCode") !== null
      // Default OFF: only show when explicitly set to anything except "0"
      ? searchParams.get("showAccountCode") !== "0"
      : false,
    account: searchParams.get("showAccount") !== "0",
    netDebit: searchParams.get("showNetDebit") !== "0",
    netCredit: searchParams.get("showNetCredit") !== "0",
  };

  const lines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        organizationId: organization.id,
        date: { lte: asOf },
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

  const aggregated = aggregateLedgerLines(
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

  const tb = buildTrialBalance(aggregated);
  const asOfDisplay = format(asOf, "dd/MM/yyyy");
  const filename = `trial-balance-${csvDateSuffix(asOf)}`;

  if (fmt === "pdf") {
    const buf = await renderTrialBalancePdf({
      orgName: organization.name,
      asOfDisplay,
      basisLabel: REPORT_BASIS_LABEL[basis],
      currency: organization.currency,
      tb,
      cols,
    });

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "trial-balance",
      eventType: "EXPORT_PDF",
      eventData: { format: "PDF", filename: `${filename}.pdf` },
    });

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  if (fmt === "xlsx") {
    const buf = await buildXlsx(tb, organization.name, asOfDisplay, basis, cols);

    await logReportActivity({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "trial-balance",
      eventType: "EXPORT_XLSX",
      eventData: { format: "XLSX", filename: `${filename}.xlsx` },
    });

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  // Default: CSV
  const csvRows: CsvRow[] = [];
  for (const g of tb.groups) {
    // Group header row
    csvRows.push({
      code: "",
      account: g.groupLabel,
      net_debit: "",
      net_credit: "",
    });
    for (const r of g.rows) {
      csvRows.push({
        code: r.accountCode ?? "",
        account: r.accountName,
        net_debit: r.netDebit > 0 ? r.netDebit : "",
        net_credit: r.netCredit > 0 ? r.netCredit : "",
      });
    }
    // Per-group subtotal row
    csvRows.push({
      code: "",
      account: `Subtotal — ${g.groupLabel}`,
      net_debit: g.subtotalDebit,
      net_credit: g.subtotalCredit,
    });
  }
  csvRows.push({
    code: "",
    account: "Total for Trial Balance",
    net_debit: tb.totalDebit,
    net_credit: tb.totalCredit,
  });

  await logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "trial-balance",
    eventType: "EXPORT_CSV",
    eventData: { format: "CSV", filename: `${filename}.csv` },
  });

  const csv = toCsv(csvRows, ["code", "account", "net_debit", "net_credit"]);
  return csvResponse(filename, csv);
}

/* ───────────────────────── helpers ───────────────────────── */

function parseFormat(s: string | null): "csv" | "xlsx" | "pdf" {
  if (s === "pdf") return "pdf";
  if (s === "xlsx") return "xlsx";
  return "csv";
}

function parseAsOf(s: string | null): Date {
  if (!s) return new Date();
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : new Date();
}

async function buildXlsx(
  tb: TrialBalance,
  orgName: string,
  asOfDisplay: string,
  basis: "accrual" | "cash",
  cols: {
    accountCode: boolean;
    account: boolean;
    netDebit: boolean;
    netCredit: boolean;
  }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trial Balance");

  // Title block (rows 1-4)
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = orgName;
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getCell("A1").font = { size: 11, color: { argb: "FF555555" } };

  ws.mergeCells("A2:D2");
  ws.getCell("A2").value = "Trial Balance";
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getCell("A2").font = { size: 14, bold: true };

  ws.mergeCells("A3:D3");
  ws.getCell("A3").value = `Basis: ${REPORT_BASIS_LABEL[basis]}`;
  ws.getCell("A3").alignment = { horizontal: "center" };

  ws.mergeCells("A4:D4");
  ws.getCell("A4").value = `As of ${asOfDisplay}`;
  ws.getCell("A4").alignment = { horizontal: "center" };

  // Header row at row 6
  const headerRow = 6;
  const columnDefs: Array<{ key: string; label: string; width: number }> = [];
  if (cols.accountCode) columnDefs.push({ key: "code", label: "Code", width: 14 });
  if (cols.account) columnDefs.push({ key: "account", label: "Account", width: 36 });
  if (cols.netDebit) columnDefs.push({ key: "net_debit", label: "Net Debit", width: 18 });
  if (cols.netCredit) columnDefs.push({ key: "net_credit", label: "Net Credit", width: 18 });

  columnDefs.forEach((c, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.label;
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle" };
    ws.getColumn(i + 1).width = c.width;
  });

  // Data rows
  let row = headerRow + 1;
  for (const g of tb.groups) {
    // Group header
    const groupCell = ws.getCell(row, 1);
    groupCell.value = g.groupLabel;
    groupCell.font = { bold: true };
    ws.mergeCells(row, 1, row, columnDefs.length || 1);
    row += 1;

    for (const r of g.rows) {
      let col = 1;
      if (cols.accountCode) {
        ws.getCell(row, col++).value = r.accountCode ?? "";
      }
      if (cols.account) {
        ws.getCell(row, col++).value = r.accountName;
      }
      if (cols.netDebit) {
        const cell = ws.getCell(row, col++);
        cell.value = r.netDebit > 0 ? r.netDebit : null;
        cell.numFmt = "#,##0.00";
      }
      if (cols.netCredit) {
        const cell = ws.getCell(row, col++);
        cell.value = r.netCredit > 0 ? r.netCredit : null;
        cell.numFmt = "#,##0.00";
      }
      row += 1;
    }

    // Subtotal row
    let col = 1;
    if (cols.accountCode) col++;
    if (cols.account) {
      const cell = ws.getCell(row, col++);
      cell.value = `Subtotal — ${g.groupLabel}`;
      cell.font = { bold: true };
    } else {
      col++;
    }
    if (cols.netDebit) {
      const cell = ws.getCell(row, col++);
      cell.value = g.subtotalDebit;
      cell.numFmt = "#,##0.00";
      cell.font = { bold: true };
    }
    if (cols.netCredit) {
      const cell = ws.getCell(row, col++);
      cell.value = g.subtotalCredit;
      cell.numFmt = "#,##0.00";
      cell.font = { bold: true };
    }
    row += 1;
  }

  // Grand total
  let col = 1;
  if (cols.accountCode) col++;
  if (cols.account) {
    const cell = ws.getCell(row, col++);
    cell.value = "Total for Trial Balance";
    cell.font = { bold: true };
  } else {
    col++;
  }
  if (cols.netDebit) {
    const cell = ws.getCell(row, col++);
    cell.value = tb.totalDebit;
    cell.numFmt = "#,##0.00";
    cell.font = { bold: true };
  }
  if (cols.netCredit) {
    const cell = ws.getCell(row, col++);
    cell.value = tb.totalCredit;
    cell.numFmt = "#,##0.00";
    cell.font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
