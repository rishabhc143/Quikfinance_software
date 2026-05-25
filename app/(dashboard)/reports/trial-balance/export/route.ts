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
    // XLSX is fixed at Zoho's 3-column layout (Account / Net Debit /
    // Net Credit) regardless of the page's column-toggle settings —
    // `cols` is intentionally not forwarded. The on-screen table +
    // PDF still respect `cols`.
    const buf = await buildXlsx(tb, organization.name, asOfDisplay, basis);

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

/**
 * Build the Trial Balance XLSX in Zoho's exact format.
 *
 * Layout (3 cols × ~10 rows, fixed shape — page column-toggles are
 * intentionally ignored here to match the Zoho-generated sample at
 * `C:\Users\user\Downloads\Trial Balance.xlsx`):
 *
 *   Row 1   merged A1:C1, multi-line title block, fill FFEEEEEE
 *   Row 2   "Account " / "Net Debit " / "Net Credit ", fill FFF5F5F5
 *   Row 3   blank spacer
 *   Row 4+  per-group label rows; empty groups merge B:C; populated
 *           groups have indented account rows underneath (no per-group
 *           subtotal rows — Zoho doesn't include them in XLSX)
 *   Last-1  "Total for Trial Balance" row, bold, fill FFF5F5F5
 *   Last    bottom spacer with A:C merged
 *
 * Column widths fixed at 39.0625 chars each.
 */
async function buildXlsx(
  tb: TrialBalance,
  orgName: string,
  asOfDisplay: string,
  basis: "accrual" | "cash"
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trial Balance");

  // Zoho-parity 3-column layout with equal ~39 char widths.
  ws.getColumn(1).width = 39.0625;
  ws.getColumn(2).width = 39.0625;
  ws.getColumn(3).width = 39.0625;

  const GRAY_TITLE = "FFEEEEEE";
  const GRAY_HEADER = "FFF5F5F5";

  // ── Row 1 — multi-line title block, merged A1:C1, gray fill ───────
  // Single string with embedded \n + indenting whitespace exactly
  // matches Zoho's stacked "{orgName} / Trial Balance / Basis: X /
  // As of dd/MM/yyyy" layout.
  ws.mergeCells("A1:C1");
  const titleCell = ws.getCell("A1");
  titleCell.value =
    `${orgName}\n            Trial Balance\n            Basis: ${REPORT_BASIS_LABEL[basis]}\n                        As of ${asOfDisplay}`;
  titleCell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: GRAY_TITLE },
  };
  ws.getRow(1).height = 80;

  // ── Row 2 — header row, light-gray fill ───────────────────────────
  // Trailing space on each label matches Zoho's actual cell content.
  const headerLabels = ["Account ", "Net Debit ", "Net Credit "];
  for (let i = 0; i < 3; i++) {
    const cell = ws.getCell(2, i + 1);
    cell.value = headerLabels[i];
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GRAY_HEADER },
    };
    cell.alignment = {
      horizontal: i === 0 ? "left" : "right",
      vertical: "middle",
    };
  }

  // ── Row 3 — blank spacer (Zoho leaves a visual gap here) ──────────

  // ── Rows 4..N — groups + account rows ─────────────────────────────
  // For empty groups we merge B:C on the label row (Zoho convention).
  // Populated groups get indented account rows underneath.
  let row = 4;
  for (const g of tb.groups) {
    ws.getCell(row, 1).value = g.groupLabel;
    if (g.rows.length === 0) {
      ws.mergeCells(row, 2, row, 3);
    }
    row += 1;

    for (const r of g.rows) {
      // Leading-space indent on the account name — Zoho ships an
      // indented string rather than using the indent feature.
      ws.getCell(row, 1).value = `      ${r.accountName}`;
      const debitCell = ws.getCell(row, 2);
      debitCell.value = r.netDebit > 0 ? r.netDebit : null;
      debitCell.numFmt = "#,##0.00";
      debitCell.alignment = { horizontal: "right" };
      const creditCell = ws.getCell(row, 3);
      creditCell.value = r.netCredit > 0 ? r.netCredit : null;
      creditCell.numFmt = "#,##0.00";
      creditCell.alignment = { horizontal: "right" };
      row += 1;
    }
  }

  // ── Total row — bold, light-gray fill ────────────────────────────
  const totalRow = ws.getRow(row);
  totalRow.getCell(1).value = "Total for Trial Balance";
  totalRow.getCell(2).value = tb.totalDebit;
  totalRow.getCell(3).value = tb.totalCredit;
  for (let i = 1; i <= 3; i++) {
    const cell = totalRow.getCell(i);
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GRAY_HEADER },
    };
    cell.alignment = {
      horizontal: i === 1 ? "left" : "right",
      vertical: "middle",
    };
    if (i > 1) cell.numFmt = "#,##0.00";
  }
  row += 1;

  // ── Bottom spacer row — A merged across (matches Zoho's row 10) ──
  ws.mergeCells(row, 1, row, 3);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
