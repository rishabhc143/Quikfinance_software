import { format } from "date-fns";
import {
  Download,
  Filter,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ReportShell } from "@/components/reports/report-shell";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildBalanceSheet,
  cashAndEquivalentsChildren,
  type BsAccountInput,
  type BsLeafGroup,
  type BsMidGroup,
} from "@/lib/reports/balance-sheet";

export const metadata = { title: "Balance Sheet" };

/**
 * Zoho-style Balance Sheet report.
 *
 *   Outer (ReportShell):
 *     "Business Overview · Balance Sheet · As of DD/MM/YYYY"
 *     + As-of date input + Export dropdown + Refresh.
 *
 *   Filter strip below:
 *     "As of: <date>" date input · "Report Basis: Accrual" (locked)
 *     · "+ More Filters" (stub) · "Run Report" (form submit).
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
  const { organization } = await requireOrganization();

  const asOf = parseAsOfDate(searchParams.as_of) ?? endOfToday();
  const asOfText = format(asOf, "dd/MM/yyyy");

  // Pull every ChartOfAccount on this org (so empty buckets surface
  // as 0.00 in the table per Zoho's empty state).
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

  const exportParams = new URLSearchParams({
    as_of: format(asOf, "yyyy-MM-dd"),
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
        <>
          <Button
            variant="outline"
            size="icon"
            disabled
            title="Advanced filters — coming soon"
            aria-label="Filters"
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled
            title="Customize columns — coming soon"
            aria-label="Customize columns"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem asChild>
                <a
                  href={`/reports/balance-sheet/export?format=csv&${exportParams.toString()}`}
                >
                  CSV
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/reports/balance-sheet/export?format=xlsx&${exportParams.toString()}`}
                >
                  XLSX (Excel)
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            asChild
            aria-label="Refresh"
          >
            <a href={`/reports/balance-sheet?${exportParams.toString()}`}>
              <RefreshCw className="h-4 w-4" />
            </a>
          </Button>
        </>
      }
    >
      {/* Filter strip — Zoho-style pills + Run Report button. */}
      <form
        action="/reports/balance-sheet"
        method="GET"
        className="flex items-end gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3 w-3" />
          <span className="uppercase tracking-wider">Filters :</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">As of :</Label>
          <Input
            type="date"
            name="as_of"
            defaultValue={format(asOf, "yyyy-MM-dd")}
            className="h-9 w-40 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Report Basis :
          </Label>
          <Badge variant="outline" className="text-xs">
            Accrual
          </Badge>
        </div>
        <Button type="button" variant="outline" size="sm" disabled>
          + More Filters
        </Button>
        <Button type="submit" size="sm">
          Run Report
        </Button>
      </form>

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
            <span>Accrual</span>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            As of {asOfText}
          </div>
        </div>

        {/* 4-level hierarchical table */}
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
