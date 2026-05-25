import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { ReportFilterStrip } from "@/components/reports/report-filter-strip";
import { AsOfDatePresetDropdown } from "@/components/reports/as-of-date-preset-dropdown";
import { ReportBasisDropdown } from "@/components/reports/report-basis-dropdown";
import {
  parseAsOfPreset,
  resolveAsOfPreset,
  type AsOfPresetKey,
} from "@/lib/reports/as-of-date-presets";
import {
  parseReportBasis,
  REPORT_BASIS_LABEL,
} from "@/lib/reports/report-basis";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";
import { ReportShell } from "@/components/reports/report-shell";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildBalanceSheet,
  cashAndEquivalentsChildren,
  mergeBalanceSheetWithCompare,
  type BsAccountInput,
  type BsLeafGroup,
  type BsMidGroup,
  type BalanceSheetWithCompare,
} from "@/lib/reports/balance-sheet";
import {
  parseCompareMode,
  computeCompareAsOf,
  COMPARE_LABEL,
} from "@/lib/reports/compare";
import { BalanceSheetCompareTable } from "@/components/reports/balance-sheet-compare-table";

export const metadata = { title: "Balance Sheet" };

/**
 * Balance Sheet report.
 *
 *   Outer (ReportShell):
 *     "Business Overview · Balance Sheet · As of DD/MM/YYYY"
 *     + As-of date input + Export dropdown + Refresh.
 *
 *   Filter strip below:
 *     "As of: <date>" date input · "Report Basis: Accrual" (locked)
 *     · "Run Report" (form submit).
 *
 *   Centered card header: org / "Balance Sheet" / Basis / As of date.
 *
 *   4-level hierarchical section table:
 *     Assets
 *       Current Assets
 *         Cash and Cash Equivalents
 *           Cash (sub-leaf) → Total for Cash
 *           Bank (sub-leaf) → Total for Bank
 *           Total for Cash and Cash Equivalents
 *         Accounts Receivable → Total for Accounts Receivable
 *         Other current assets → Total for Other current assets
 *         Total for Current Assets
 *       Non Current Assets → Total for Non Current Assets
 *       Fixed Assets → Total for Fixed Assets
 *       Other Assets → Total for Other Assets
 *       Total for Assets
 *     Liabilities & Equities
 *       Liabilities → … → Total for Liabilities
 *       Equities → Total for Equities
 *       Total for Liabilities & Equities
 */
export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization, user } = await requireOrganization();

  // Parse As of Date preset (Item #2.8). Accepts both `asOf` (new
  // canonical name written by AsOfDatePresetDropdown) and `as_of`
  // (legacy bookmarks). Preset defaults to "today" so a fresh visit
  // matches the previous behavior of `endOfToday()`.
  const asOfRaw = searchParams.asOf ?? searchParams.as_of;
  const asOfPreset: AsOfPresetKey =
    parseAsOfPreset(searchParams.asOfPreset) ??
    (asOfRaw ? "custom" : "today");
  const asOf =
    asOfPreset === "custom"
      ? (parseAsOfDate(asOfRaw) ?? endOfToday())
      : resolveAsOfPreset(asOfPreset, organization.fiscalYearStart);
  const asOfText = format(asOf, "dd/MM/yyyy");
  const basis = parseReportBasis(searchParams);
  const compareMode = parseCompareMode(searchParams);

  // Pull every ChartOfAccount on this org (so empty buckets surface
  // as 0.00 in the table per the reference empty state).
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
        account: {
          type: { in: ["ASSET", "LIABILITY", "EQUITY"] },
        },
      },
      select: {
        debit: true,
        credit: true,
        accountId: true,
        account: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
          },
        },
      },
    }),
  ]);

  // Aggregate per-account net balance for accounts that have ledger
  // activity. Then join with the full ChartOfAccount list so zero-
  // balance accounts still appear in their section.
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
  const cur = organization.currency;

  // ── Compare-period: fetch previous as-of date's ledger snapshot.
  let bsCompare: BalanceSheetWithCompare | null = null;
  let previousAsOfText: string | null = null;
  if (compareMode !== "none") {
    const prevAsOf = computeCompareAsOf(asOf, compareMode);
    previousAsOfText = format(prevAsOf, "dd/MM/yyyy");
    const prevJeLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: organization.id,
          date: { lte: prevAsOf },
        },
        account: {
          type: { in: ["ASSET", "LIABILITY", "EQUITY"] },
        },
      },
      select: {
        debit: true,
        credit: true,
        accountId: true,
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
    const prevLedgerById = new Map(prevLedger.map((r) => [r.accountId, r]));
    const prevInputs: BsAccountInput[] = accounts.map((a) => {
      const row = prevLedgerById.get(a.id);
      return {
        accountId: a.id,
        accountName: a.name,
        accountCode: a.code,
        accountType: a.type as AccountBucket,
        accountSubType: a.subType,
        netBalance: row ? row.netBalance : 0,
      };
    });
    const prevBs = buildBalanceSheet(prevInputs);
    bsCompare = mergeBalanceSheetWithCompare(bs, prevBs);
  }

  const exportParams = new URLSearchParams({
    as_of: format(asOf, "yyyy-MM-dd"),
  });

  // Pre-fetch the Report Activity timeline for the toolbar's drawer.
  const activityRows = await getRecentReportActivity(
    organization.id,
    "balance-sheet",
    20
  );
  const existingSchedule = await getExistingSchedule({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "balance-sheet",
  });

  return (
    <ReportShell
      title="Balance Sheet"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Business Overview</span>
          <span className="text-muted-foreground">•</span>
          <span>As of {asOfText}</span>
        </span>
      }
      actions={
        <ReportToolbar
          reportKey="balance-sheet"
          reportTitle="Balance Sheet"
          fiscalYearStartMonth={organization.fiscalYearStart}
          exportBaseUrl="/reports/balance-sheet/export"
          exportParams={exportParams.toString()}
          columns={[
            { key: "showCode", label: "Account Code", defaultEnabled: true },
          ]}
          activityRows={activityRows}
          existingSchedule={existingSchedule}
        />
      }
    >
      {/* Filter strip — pills */}
      <ReportFilterStrip>
        <AsOfDatePresetDropdown
          defaultPreset={asOfPreset}
          defaultAsOf={asOf}
          fiscalYearStartMonth={organization.fiscalYearStart}
        />
        <input type="hidden" name="basis" value={basis} />
        <ReportBasisDropdown defaultBasis={basis} />
      </ReportFilterStrip>

      <Card className="p-0 overflow-hidden">
        {/* Centered report header */}
        <div className="text-center space-y-1 pt-8 pb-6">
          <div className="text-sm text-muted-foreground">
            {organization.name}
          </div>
          <h2 className="text-xl font-semibold">Balance Sheet</h2>
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
          <div className="text-sm text-muted-foreground tabular-nums">
            As of {asOfText}
            {bsCompare ? (
              <span className="ml-2">
                vs {previousAsOfText}{" "}
                <span className="text-xs uppercase tracking-wider text-emerald-600">
                  · {COMPARE_LABEL[compareMode]}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        {/* 4-level hierarchical table */}
        {bsCompare ? (
          <BalanceSheetCompareTable
            bs={bsCompare}
            currentLabel={`As of ${asOfText}`}
            previousLabel={`As of ${previousAsOfText}`}
          />
        ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Account</th>
              <th className="text-right px-6 py-3 font-medium w-48">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {/* ── ASSETS ──────────────────────────────────────── */}
            <TopHeader label="Assets" />
            {bs.assets.groups.map((mid) => (
              <MidGroup key={mid.label} mid={mid} currency={cur} />
            ))}
            <SubtotalRow label="Total for Assets" amount={bs.assets.total} currency={cur} emphasize />

            {/* ── LIABILITIES & EQUITIES ──────────────────────── */}
            <TopHeader label="Liabilities & Equities" />
            <TopSubHeader label="Liabilities" indent={1} />
            {bs.liabilities.groups.map((mid) => (
              <MidGroup key={mid.label} mid={mid} currency={cur} indent={1} />
            ))}
            <SubtotalRow label="Total for Liabilities" amount={bs.liabilities.total} currency={cur} indent={1} />

            <TopSubHeader label={bs.equities.label} indent={1} />
            {bs.equities.accounts.map((a) => (
              <AccountRow key={a.accountId} account={a} indent={2} />
            ))}
            <SubtotalRow
              label={`Total for ${bs.equities.label}`}
              amount={bs.equities.total}
              currency={cur}
              indent={1}
            />

            <SubtotalRow
              label="Total for Liabilities & Equities"
              amount={bs.liabilitiesAndEquitiesTotal}
              currency={cur}
              emphasize
            />
          </tbody>
        </table>
        )}

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

// ─── Rendering helpers ────────────────────────────────────────────

function TopHeader({ label }: { label: string }) {
  return (
    <tr>
      <td className="px-6 py-3 font-bold text-base" colSpan={2}>
        {label}
      </td>
    </tr>
  );
}

function TopSubHeader({ label, indent }: { label: string; indent: number }) {
  return (
    <tr>
      <td
        className="py-3 font-semibold"
        colSpan={2}
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {label}
      </td>
    </tr>
  );
}

function MidGroup({
  mid,
  currency,
  indent = 0,
}: {
  mid: BsMidGroup;
  currency: string;
  indent?: number;
}) {
  return (
    <>
      <tr>
        <td
          className="py-3 font-semibold"
          colSpan={2}
          style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
        >
          {mid.label}
        </td>
      </tr>
      {mid.leaves.map((leaf) => (
        <LeafGroup
          key={leaf.label}
          leaf={leaf}
          currency={currency}
          indent={indent + 1}
        />
      ))}
      {mid.accounts.map((a) => (
        <AccountRow
          key={a.accountId}
          account={a}
          indent={indent + 1}
        />
      ))}
      <SubtotalRow
        label={`Total for ${mid.label}`}
        amount={mid.total}
        currency={currency}
        indent={indent}
      />
    </>
  );
}

function LeafGroup({
  leaf,
  currency,
  indent,
}: {
  leaf: BsLeafGroup;
  currency: string;
  indent: number;
}) {
  // "Cash and Cash Equivalents" has nested children (Cash + Bank).
  const children = cashAndEquivalentsChildren(leaf);
  if (children) {
    return (
      <>
        <tr>
          <td
            className="py-3 font-semibold"
            colSpan={2}
            style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
          >
            {leaf.label}
          </td>
        </tr>
        {children.map((child) => (
          <LeafGroup
            key={child.label}
            leaf={child}
            currency={currency}
            indent={indent + 1}
          />
        ))}
        <SubtotalRow
          label={`Total for ${leaf.label}`}
          amount={leaf.total}
          currency={currency}
          indent={indent}
        />
      </>
    );
  }
  return (
    <>
      <tr>
        <td
          className="py-3 font-semibold"
          colSpan={2}
          style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
        >
          {leaf.label}
        </td>
      </tr>
      {leaf.accounts.map((a) => (
        <AccountRow
          key={a.accountId}
          account={a}
          indent={indent + 1}
        />
      ))}
      <SubtotalRow
        label={`Total for ${leaf.label}`}
        amount={leaf.total}
        currency={currency}
        indent={indent}
      />
    </>
  );
}

function AccountRow({
  account,
  indent,
}: {
  account: { accountId: string; accountName: string; accountCode: string | null; amount: number };
  // `currency` prop intentionally unused here — amounts render
  // number-only and the trailing footnote names the currency once.
  // Kept the prop name on the call sites in case we add per-row
  // currency in v1.1 (multi-currency Balance Sheet).
  indent: number;
}) {
  return (
    <tr className="hover:bg-muted/20">
      <td
        className="py-2.5"
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {account.accountCode ? (
          <span className="font-mono text-xs text-muted-foreground mr-2">
            {account.accountCode}
          </span>
        ) : null}
        {account.accountName}
      </td>
      <td className="px-6 py-2.5 text-right tabular-nums">
        {formatBsAmount(account.amount)}
      </td>
    </tr>
  );
}

function SubtotalRow({
  label,
  amount,
  currency,
  indent = 0,
  emphasize,
}: {
  label: string;
  amount: number;
  currency: string;
  indent?: number;
  emphasize?: boolean;
}) {
  void currency;
  return (
    <tr className={emphasize ? "bg-muted/40" : ""}>
      <td
        className="py-3 font-semibold"
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {label}
      </td>
      <td
        className={
          "px-6 py-3 text-right tabular-nums font-semibold " +
          (amount < 0 ? "text-destructive" : "")
        }
      >
        {formatBsAmount(amount)}
      </td>
    </tr>
  );
}

function formatBsAmount(n: number): string {
  if (Math.abs(n) < 0.005) return "0.00";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${abs}` : abs;
}

function parseAsOfDate(s: string | undefined): Date | null {
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
