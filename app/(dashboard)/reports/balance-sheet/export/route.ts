import { format } from "date-fns";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildBalanceSheet,
  cashAndEquivalentsChildren,
  type BalanceSheet,
  type BsAccountInput,
  type BsLeafGroup,
  type BsMidGroup,
} from "@/lib/reports/balance-sheet";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import { logReportActivity } from "@/lib/reports/activity";

/**
 * REPORTS — Export endpoint for the Zoho-style Balance Sheet page.
 *
 *   ?format=csv  (default) — section / account / amount, flat
 *   ?format=xlsx           — Zoho-style with merged banners,
 *                            borders, grey fills, bold subtotals.
 *
 * Filter:
 *   ?as_of=YYYY-MM-DD — single "as of" date; matches the page input.
 *
 * Filename: balance-sheet-as-of-{yyyymmdd}.csv (or .xlsx).
 */
export async function GET(req: Request) {
  const { organization, user } = await requireOrganization();
  const url = new URL(req.url);
  const fmt = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const asOf = parseAsOf(url.searchParams.get("as_of")) ?? endOfToday();

  const [accounts, jeLines] = await Promise.all([
    db.chartOfAccount.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        type: { in: ["ASSET", "LIABILITY", "EQUITY"] },
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        subType: true,
      },
    }),
    db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: organization.id,
          date: { lte: asOf },
        },
        account: { type: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
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

  const inputs: BsAccountInput[] = accounts.map((a) => {
    const row = ledgerByAccountId.get(a.id);
    return {
      accountId: a.id,
      accountName: a.name,
      accountCode: a.code,
      accountType: a.type as AccountBucket,
      accountSubType: a.subType,
      netBalance: row ? row.netBalance : 0,
    };
  });
  const bs = buildBalanceSheet(inputs);
  const filenameStub = `balance-sheet-as-of-${csvDateSuffix(asOf)}`;

  void logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "balance-sheet",
    eventType: fmt === "xlsx" ? "EXPORT_XLSX" : "EXPORT_CSV",
    eventData: {
      format: fmt === "xlsx" ? "XLSX" : "CSV",
      filename: `${filenameStub}.${fmt}`,
    },
  });

  if (fmt === "xlsx") {
    return buildXlsx(organization.name, asOf, bs, filenameStub);
  }
  return buildCsv(bs, filenameStub);
}

// ─── CSV (flat dump of the hierarchy) ────────────────────────────

function buildCsv(bs: BalanceSheet, filenameStub: string): Response {
  const rows: CsvRow[] = [];

  function pushAccount(level: string, label: string, amount: number | "") {
    rows.push({ level, label, amount });
  }

  function emitTop(top: BalanceSheet["assets"]) {
    pushAccount("top-header", top.label, "");
    for (const mid of top.groups) {
      emitMid(mid);
    }
    pushAccount("top-total", `Total for ${top.label}`, top.total);
  }

  function emitMid(mid: BsMidGroup) {
    pushAccount("mid-header", mid.label, "");
    for (const leaf of mid.leaves) {
      emitLeaf(leaf);
    }
    for (const a of mid.accounts) {
      pushAccount("account", labelFor(a.accountCode, a.accountName), a.amount);
    }
    pushAccount("mid-total", `Total for ${mid.label}`, mid.total);
  }

  function emitLeaf(leaf: BsLeafGroup) {
    pushAccount("leaf-header", leaf.label, "");
    const kids = cashAndEquivalentsChildren(leaf);
    if (kids) {
      for (const k of kids) {
        pushAccount("leaf-header", k.label, "");
        for (const a of k.accounts) {
          pushAccount("account", labelFor(a.accountCode, a.accountName), a.amount);
        }
        pushAccount("leaf-total", `Total for ${k.label}`, k.total);
      }
    } else {
      for (const a of leaf.accounts) {
        pushAccount("account", labelFor(a.accountCode, a.accountName), a.amount);
      }
    }
    pushAccount("leaf-total", `Total for ${leaf.label}`, leaf.total);
  }

  emitTop(bs.assets);
  rows.push({ level: "spacer", label: "Liabilities & Equities", amount: "" });
  pushAccount("top-header", "Liabilities", "");
  for (const mid of bs.liabilities.groups) {
    emitMid(mid);
  }
  pushAccount("top-total", "Total for Liabilities", bs.liabilities.total);
  emitMid(bs.equities);
  pushAccount(
    "grand-total",
    "Total for Liabilities & Equities",
    bs.liabilitiesAndEquitiesTotal
  );

  const csv = toCsv(rows, ["level", "label", "amount"]);
  return csvResponse(filenameStub, csv);
}

function labelFor(code: string | null, name: string): string {
  return code ? `${code} · ${name}` : name;
}

// ─── XLSX (Zoho-style with borders + fills + bold totals) ────────

async function buildXlsx(
  orgName: string,
  asOf: Date,
  bs: BalanceSheet,
  filenameStub: string
): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quikfinance";
  wb.created = new Date();
  const ws = wb.addWorksheet("Balance Sheet");

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

  // Row 1 — merged banner.
  ws.mergeCells("A1:B1");
  const banner = ws.getCell("A1");
  banner.value =
    `${orgName}\n` +
    `            Balance Sheet\n` +
    `            Basis: Accrual\n` +
    `                        As of ${format(asOf, "dd/MM/yyyy")}`;
  banner.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  banner.fill = bannerFill;
  banner.border = allBorders;
  banner.font = { size: 11, color: { argb: "FF000000" } };
  ws.getRow(1).height = 75;

  // Row 2 — column headers.
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
    const fill =
      opts.fill === "total" ? totalFill : opts.fill === "section" ? sectionFill : sectionFill;
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

  function spacer() {
    ws.getRow(row).height = 8;
    row += 1;
  }

  function emitLeaf(leaf: BsLeafGroup, indent: number) {
    const kids = cashAndEquivalentsChildren(leaf);
    if (kids) {
      emit(leaf.label, null, { indent, bold: true, fill: "section" });
      for (const k of kids) {
        emit(k.label, null, { indent: indent + 1, bold: true, fill: "section" });
        for (const a of k.accounts) {
          emit(labelFor(a.accountCode, a.accountName), a.amount, {
            indent: indent + 2,
            fill: "section",
          });
        }
        emit(`Total for ${k.label}`, k.total, {
          indent: indent + 1,
          bold: true,
          fill: "total",
          sizeUp: true,
        });
      }
      emit(`Total for ${leaf.label}`, leaf.total, {
        indent,
        bold: true,
        fill: "total",
        sizeUp: true,
      });
      return;
    }
    emit(leaf.label, null, { indent, bold: true, fill: "section" });
    for (const a of leaf.accounts) {
      emit(labelFor(a.accountCode, a.accountName), a.amount, {
        indent: indent + 1,
        fill: "section",
      });
    }
    emit(`Total for ${leaf.label}`, leaf.total, {
      indent,
      bold: true,
      fill: "total",
      sizeUp: true,
    });
  }

  function emitMid(mid: BsMidGroup, indent: number) {
    emit(mid.label, null, { indent, bold: true, fill: "section" });
    for (const leaf of mid.leaves) {
      emitLeaf(leaf, indent + 1);
    }
    for (const a of mid.accounts) {
      emit(labelFor(a.accountCode, a.accountName), a.amount, {
        indent: indent + 1,
        fill: "section",
      });
    }
    emit(`Total for ${mid.label}`, mid.total, {
      indent,
      bold: true,
      fill: "total",
      sizeUp: true,
    });
  }

  // Assets
  emit("Assets", null, { bold: true, sizeUp: true, fill: "section" });
  for (const mid of bs.assets.groups) emitMid(mid, 1);
  emit("Total for Assets", bs.assets.total, {
    bold: true,
    fill: "total",
    sizeUp: true,
  });
  spacer();

  // Liabilities & Equities
  emit("Liabilities & Equities", null, { bold: true, sizeUp: true, fill: "section" });
  emit("Liabilities", null, { indent: 1, bold: true, fill: "section" });
  for (const mid of bs.liabilities.groups) emitMid(mid, 2);
  emit("Total for Liabilities", bs.liabilities.total, {
    indent: 1,
    bold: true,
    fill: "total",
    sizeUp: true,
  });
  emit(bs.equities.label, null, { indent: 1, bold: true, fill: "section" });
  for (const a of bs.equities.accounts) {
    emit(labelFor(a.accountCode, a.accountName), a.amount, {
      indent: 2,
      fill: "section",
    });
  }
  emit(`Total for ${bs.equities.label}`, bs.equities.total, {
    indent: 1,
    bold: true,
    fill: "total",
    sizeUp: true,
  });
  emit(
    "Total for Liabilities & Equities",
    bs.liabilitiesAndEquitiesTotal,
    { bold: true, fill: "total", sizeUp: true }
  );

  // Closing banner row.
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

function parseAsOf(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d, 23, 59, 59, 999));
}

function endOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}
