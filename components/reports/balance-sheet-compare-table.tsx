/**
 * REPORTS — Balance Sheet compare-mode table.
 *
 * Renders the 4-level Zoho hierarchy with two as-of date columns
 * + a % change column. Used by `/reports/balance-sheet` when the
 * Customize drawer's Compare With ≠ None.
 *
 * Kept in its own file so the BS page file doesn't double in size
 * to host two parallel rendering trees.
 */

import { pctChange, formatPctChange } from "@/lib/reports/compare";
import type {
  BalanceSheetWithCompare,
  BsMidGroupWithCompare,
  BsLeafGroupWithCompare,
  BsAccountRowWithCompare,
} from "@/lib/reports/balance-sheet";

export function BalanceSheetCompareTable({
  bs,
  currentLabel,
  previousLabel,
}: {
  bs: BalanceSheetWithCompare;
  currentLabel: string;
  previousLabel: string;
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
        {/* Assets */}
        <TopHeader label="Assets" />
        {bs.assets.groups.map((mid) => (
          <MidGroup key={mid.label} mid={mid} />
        ))}
        <Subtotal
          label="Total for Assets"
          curr={bs.assets.total}
          prev={bs.assets.previousTotal}
          emphasize
        />

        {/* Liabilities & Equities */}
        <TopHeader label="Liabilities & Equities" />
        <TopSubHeader label="Liabilities" indent={1} />
        {bs.liabilities.groups.map((mid) => (
          <MidGroup key={mid.label} mid={mid} indent={1} />
        ))}
        <Subtotal
          label="Total for Liabilities"
          curr={bs.liabilities.total}
          prev={bs.liabilities.previousTotal}
          indent={1}
        />

        <TopSubHeader label={bs.equities.label} indent={1} />
        {bs.equities.accounts.map((a) => (
          <AccountRow key={a.accountId} account={a} indent={2} />
        ))}
        <Subtotal
          label={`Total for ${bs.equities.label}`}
          curr={bs.equities.total}
          prev={bs.equities.previousTotal}
          indent={1}
        />

        <Subtotal
          label="Total for Liabilities & Equities"
          curr={bs.liabilitiesAndEquitiesTotal}
          prev={bs.previousLiabilitiesAndEquitiesTotal}
          emphasize
        />
      </tbody>
    </table>
  );
}

function TopHeader({ label }: { label: string }) {
  return (
    <tr>
      <td className="px-6 py-3 font-bold text-base" colSpan={4}>
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
        colSpan={4}
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {label}
      </td>
    </tr>
  );
}

function MidGroup({
  mid,
  indent = 0,
}: {
  mid: BsMidGroupWithCompare;
  indent?: number;
}) {
  return (
    <>
      <tr>
        <td
          className="py-3 font-semibold"
          colSpan={4}
          style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
        >
          {mid.label}
        </td>
      </tr>
      {mid.leaves.map((leaf) => (
        <LeafGroup key={leaf.label} leaf={leaf} indent={indent + 1} />
      ))}
      {mid.accounts.map((a) => (
        <AccountRow key={a.accountId} account={a} indent={indent + 1} />
      ))}
      <Subtotal
        label={`Total for ${mid.label}`}
        curr={mid.total}
        prev={mid.previousTotal}
        indent={indent}
      />
    </>
  );
}

function LeafGroup({
  leaf,
  indent,
}: {
  leaf: BsLeafGroupWithCompare;
  indent: number;
}) {
  return (
    <>
      <tr>
        <td
          className="py-3 font-semibold"
          colSpan={4}
          style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
        >
          {leaf.label}
        </td>
      </tr>
      {leaf.accounts.map((a) => (
        <AccountRow key={a.accountId} account={a} indent={indent + 1} />
      ))}
      <Subtotal
        label={`Total for ${leaf.label}`}
        curr={leaf.total}
        prev={leaf.previousTotal}
        indent={indent}
      />
    </>
  );
}

function AccountRow({
  account,
  indent,
}: {
  account: BsAccountRowWithCompare;
  indent: number;
}) {
  return (
    <tr className="hover:bg-muted/20">
      <td
        className="px-6 py-2.5"
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {account.accountCode ? (
          <span className="font-mono text-xs text-muted-foreground mr-2">
            {account.accountCode}
          </span>
        ) : null}
        {account.accountName}
      </td>
      <AmountCell value={account.amount} />
      <AmountCell value={account.previousAmount} muted />
      <ChangeCell curr={account.amount} prev={account.previousAmount} />
    </tr>
  );
}

function Subtotal({
  label,
  curr,
  prev,
  indent = 0,
  emphasize,
}: {
  label: string;
  curr: number;
  prev: number;
  indent?: number;
  emphasize?: boolean;
}) {
  return (
    <tr className={emphasize ? "bg-muted/40" : "bg-muted/10"}>
      <td
        className="px-6 py-3 font-semibold"
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {label}
      </td>
      <AmountCell value={curr} bold />
      <AmountCell value={prev} bold muted />
      <ChangeCell curr={curr} prev={prev} bold />
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

