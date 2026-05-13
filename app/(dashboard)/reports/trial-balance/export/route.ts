import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  trialBalanceImbalance,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";

const TYPE_ORDER: AccountBucket[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "OTHER_INCOME",
  "EXPENSE",
  "COST_OF_GOODS_SOLD",
  "OTHER_EXPENSE",
];

const TYPE_LABEL: Record<AccountBucket, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  OTHER_INCOME: "Other Income",
  EXPENSE: "Expenses",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_EXPENSE: "Other Expenses",
};

/**
 * RPT-A — Trial Balance CSV export. Same aggregation as the page.
 */
export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const url = new URL(req.url);
  const asOf = url.searchParams.get("asOf")
    ? new Date(url.searchParams.get("asOf")!)
    : new Date();

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
      account: { select: { id: true, name: true, code: true, type: true } },
    },
  });

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

  rows.sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.accountType);
    const tb = TYPE_ORDER.indexOf(b.accountType);
    if (ta !== tb) return ta - tb;
    const ca = a.accountCode ?? "";
    const cb = b.accountCode ?? "";
    if (ca !== cb) return ca.localeCompare(cb, undefined, { numeric: true });
    return a.accountName.localeCompare(b.accountName);
  });

  const totalDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
  const imbalance = trialBalanceImbalance(rows);

  const csvRows: CsvRow[] = [
    ...rows.map((r) => ({
      code: r.accountCode ?? "",
      account: r.accountName,
      type: TYPE_LABEL[r.accountType],
      debit: r.totalDebit > 0 ? r.totalDebit : "",
      credit: r.totalCredit > 0 ? r.totalCredit : "",
    })),
    { code: "", account: "Totals", type: "", debit: totalDebit, credit: totalCredit },
    { code: "", account: "Imbalance (|DR − CR|)", type: "", debit: "", credit: imbalance },
  ];

  const csv = toCsv(csvRows, ["code", "account", "type", "debit", "credit"]);
  return csvResponse(`trial-balance-${csvDateSuffix(asOf)}`, csv);
}
