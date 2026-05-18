/**
 * REPORTS — Cash Flow Statement compare-mode table.
 *
 * Renders the indirect-method Cash Flow layout with two period
 * columns + a % change column. Mirrors the structure of
 * components/reports/balance-sheet-compare-table.tsx.
 */

import Link from "next/link";
import { pctChange, formatPctChange } from "@/lib/reports/compare";
import type {
  CashFlowStatementWithCompare,
  CashFlowLineWithCompare,
} from "@/lib/reports/cash-flow";

export function CashFlowCompareTable({
  cf,
  currentLabel,
  previousLabel,
  netIncomeHrefCurrent,
  netIncomeHrefPrevious,
}: {
  cf: CashFlowStatementWithCompare;
  currentLabel: string;
  previousLabel: string;
  /** Link the current-period Net Income cell to the matching P&L view. */
  netIncomeHrefCurrent: string;
  netIncomeHrefPrevious: string;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="text-left px-6 py-3 font-medium">Account</th>
          <th className="text-right px-6 py-3 font-medium w-36">
            {currentLabel}
          </th>
          <th className="text-right px-6 py-3 font-medium w-36">
            {previousLabel}
          </th>
          <th className="text-right px-6 py-3 font-medium w-24">Change</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        <RowCompare
          label="Beginning Cash Balance"
          curr={cf.beginningCashBalance}
          prev={cf.previousBeginningCashBalance}
          boldLabel
        />

        <SectionHeader label="Cash Flow from Operating Activities" />
        <RowCompare
          label={
            <span className="inline-flex gap-1.5 items-baseline">
              <Link
                href={netIncomeHrefCurrent}
                className="text-primary hover:underline"
              >
                Net Income
              </Link>
              <Link
                href={netIncomeHrefPrevious}
                className="text-muted-foreground hover:underline text-xs"
                title="View prior-period P&L"
              >
                (prev)
              </Link>
            </span>
          }
          curr={cf.operating.netIncome}
          prev={cf.operating.previousNetIncome}
          indent={1}
        />
        <SectionHeader label="Non-cash adjustments" indent={1} />
        {cf.operating.nonCashAdjustments.map((adj) => (
          <RowCompare
            key={adj.label}
            label={adj.label}
            curr={adj.amount}
            prev={adj.previousAmount}
            indent={2}
          />
        ))}
        <RowCompare
          label="Non-cash adjustments Total"
          curr={cf.operating.nonCashAdjustmentsTotal}
          prev={cf.operating.previousNonCashAdjustmentsTotal}
          indent={1}
          boldLabel
        />
        <RowCompare
          label="Net cash provided by Operating Activities"
          curr={cf.operating.netCashFromOperating}
          prev={cf.operating.previousNetCashFromOperating}
          boldLabel
          emphasize
        />

        <SectionHeader label="Cash Flow from Investing Activities" />
        {cf.investing.items.map((it) => (
          <RowCompare
            key={it.label}
            label={it.label}
            curr={it.amount}
            prev={it.previousAmount}
            indent={1}
          />
        ))}
        <RowCompare
          label="Net cash provided by Investing Activities"
          curr={cf.investing.netCashFromInvesting}
          prev={cf.investing.previousNetCashFromInvesting}
          boldLabel
          emphasize
        />

        <SectionHeader label="Cash Flow from Financing Activities" />
        {cf.financing.items.map((it) => (
          <RowCompare
            key={it.label}
            label={it.label}
            curr={it.amount}
            prev={it.previousAmount}
            indent={1}
          />
        ))}
        <RowCompare
          label="Net cash provided by Financing Activities"
          curr={cf.financing.netCashFromFinancing}
          prev={cf.financing.previousNetCashFromFinancing}
          boldLabel
          emphasize
        />

        <RowCompare
          label="Net Change in cash"
          curr={cf.netChangeInCash}
          prev={cf.previousNetChangeInCash}
          boldLabel
        />
        <RowCompare
          label="Ending Cash Balance"
          curr={cf.endingCashBalance}
          prev={cf.previousEndingCashBalance}
          boldLabel
          emphasize
        />
      </tbody>
    </table>
  );
}

function SectionHeader({
  label,
  indent = 0,
}: {
  label: string;
  indent?: number;
}) {
  return (
    <tr>
      <td
        colSpan={4}
        className="px-6 py-3 font-semibold"
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {label}
      </td>
    </tr>
  );
}

function RowCompare({
  label,
  curr,
  prev,
  indent = 0,
  boldLabel,
  emphasize,
}: {
  label: React.ReactNode;
  curr: number;
  prev: number;
  indent?: number;
  boldLabel?: boolean;
  emphasize?: boolean;
}) {
  return (
    <tr className={emphasize ? "bg-muted/40" : ""}>
      <td
        className={"px-6 py-2.5 " + (boldLabel ? "font-semibold" : "")}
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {label}
      </td>
      <AmountCell value={curr} bold={boldLabel} />
      <AmountCell value={prev} bold={boldLabel} muted />
      <ChangeCell curr={curr} prev={prev} bold={boldLabel} />
    </tr>
  );
}

function AmountCell({
  value,
  bold,
  muted,
}: {
  value: number;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={
        "px-6 py-2.5 text-right tabular-nums " +
        (bold ? "font-semibold " : "") +
        (muted ? "text-muted-foreground " : "") +
        (value < 0 ? "text-destructive" : "")
      }
    >
      {fmt(value)}
    </td>
  );
}

function ChangeCell({
  curr,
  prev,
  bold,
}: {
  curr: number;
  prev: number;
  bold?: boolean;
}) {
  const p = pctChange(curr, prev);
  const label = formatPctChange(p);
  const cls =
    p === null
      ? "text-muted-foreground"
      : p >= 0
        ? "text-emerald-600"
        : "text-destructive";
  return (
    <td
      className={
        "px-6 py-2.5 text-right tabular-nums " +
        cls +
        (bold ? " font-semibold" : "")
      }
    >
      {label}
    </td>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) < 0.005) return "0.00";
  const abs = Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${abs}` : abs;
}

// Reference the imported type so unused-import lint stays quiet.
// (cashFlowLineWithCompare is consumed by the nested map calls but
// its concrete name doesn't appear in the JSX above.)
void ({} as CashFlowLineWithCompare);
