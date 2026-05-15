/**
 * REPORTS — Pure builder for the Zoho-style Cash Flow Statement.
 *
 * Uses the **indirect method**:
 *
 *   Beginning Cash Balance
 *   + Net Income (from P&L for the period)
 *   + Non-cash adjustments
 *       Δ Accounts Receivable      (− if AR rose)
 *       Δ Inventory                (− if inventory rose)
 *       Δ Accounts Payable         (+ if AP rose)
 *       Δ Other current liabilities (+ if rose)
 *       …other working-capital deltas
 *   = Net cash provided by Operating Activities
 *
 *   + Net cash provided by Investing Activities
 *       − Δ Fixed Assets / Non-current Assets
 *
 *   + Net cash provided by Financing Activities
 *       + Δ Non-current Liabilities
 *       + Δ Equity (excluding retained-earnings movement)
 *
 *   = Net Change in Cash
 *   Ending Cash Balance
 *
 * Identity check: when the books balance, the three sections sum to
 * (Ending − Beginning) cash.
 *
 * No DB calls — pure transform of the period-bounded ledger sums.
 */

import type { AccountBucket } from "./ledger-aggregation";

/** Period-bounded balance change for one account, computed by the caller. */
export type CashFlowAccountDelta = {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  accountType: AccountBucket;
  accountSubType: string | null;
  /**
   * Δ = (totalDebit − totalCredit) for the journal entries in
   * [from, to]. The cash-flow math sign-flips per account type
   * (a debit-balance asset increase consumes cash; a credit-balance
   * liability increase sources cash, etc.).
   */
  rawDelta: number;
};

export type CashFlowLine = {
  label: string;
  amount: number;
};

export type OperatingActivities = {
  netIncome: number;
  nonCashAdjustments: CashFlowLine[];
  nonCashAdjustmentsTotal: number;
  netCashFromOperating: number;
};

export type InvestingActivities = {
  items: CashFlowLine[];
  netCashFromInvesting: number;
};

export type FinancingActivities = {
  items: CashFlowLine[];
  netCashFromFinancing: number;
};

export type CashFlowStatement = {
  beginningCashBalance: number;
  operating: OperatingActivities;
  investing: InvestingActivities;
  financing: FinancingActivities;
  netChangeInCash: number;
  endingCashBalance: number;
};

const CASH_SUBTYPES = new Set(["Cash", "Bank"]);

/** Returns true when the account's balance physically represents cash. */
export function isCashAccount(
  type: AccountBucket,
  subType: string | null
): boolean {
  if (type !== "ASSET") return false;
  return CASH_SUBTYPES.has((subType ?? "").trim());
}

/**
 * Compute the indirect-method cash-flow statement.
 *
 * Inputs (caller pre-computes from journal entries):
 *   - `beginningCashBalance` — sum of cash + bank account balances
 *     at end-of-day on the day before `from`
 *   - `endingCashBalance` — same, but at end-of-day on `to`
 *   - `netIncome` — Revenue − Expense for the period (matches the
 *     P&L's Net Profit/Loss when run over the same window)
 *   - `nonCashDeltas` — period-bounded balance changes for every
 *     non-cash account. The function buckets them into the three
 *     activity sections.
 *
 * For an empty period (no journal entries), every input is 0 and the
 * statement returns all zeros with the section structure intact.
 */
export function buildCashFlowStatement(args: {
  beginningCashBalance: number;
  endingCashBalance: number;
  netIncome: number;
  nonCashDeltas: CashFlowAccountDelta[];
}): CashFlowStatement {
  const { beginningCashBalance, endingCashBalance, netIncome } = args;

  const operatingAdjustments: CashFlowLine[] = [];
  const investingItems: CashFlowLine[] = [];
  const financingItems: CashFlowLine[] = [];

  for (const d of args.nonCashDeltas) {
    if (d.rawDelta === 0) continue;
    if (isCashAccount(d.accountType, d.accountSubType)) continue;
    const subType = (d.accountSubType ?? "").trim();
    const isCurrentAsset =
      d.accountType === "ASSET" &&
      (subType === "Other Current Asset" ||
        subType === "Stock" ||
        d.accountName.trim().toLowerCase() === "accounts receivable");
    const isNonCurrentAsset =
      d.accountType === "ASSET" &&
      (subType === "Fixed Asset" || subType === "Non Current Asset");
    const isOtherAsset = d.accountType === "ASSET" && !isCurrentAsset && !isNonCurrentAsset;

    const isCurrentLiability =
      d.accountType === "LIABILITY" &&
      (subType === "Other Current Liability" ||
        d.accountName.trim().toLowerCase() === "accounts payable");
    const isNonCurrentLiability =
      d.accountType === "LIABILITY" && subType === "Non Current Liability";
    const isOtherLiability =
      d.accountType === "LIABILITY" && !isCurrentLiability && !isNonCurrentLiability;

    if (isCurrentAsset) {
      // Asset increase consumes cash → subtract the rise.
      operatingAdjustments.push({
        label: deltaLabel("Δ", d.accountName),
        amount: -d.rawDelta,
      });
    } else if (isCurrentLiability) {
      // Liability increase sources cash → credit balance is positive
      // in rawDelta terms means rawDelta is negative; we want to add
      // the credit-side rise. Per ledger sign: credit increase shows
      // as negative rawDelta, so we negate.
      operatingAdjustments.push({
        label: deltaLabel("Δ", d.accountName),
        amount: -d.rawDelta,
      });
    } else if (isNonCurrentAsset) {
      // Investing: an increase in non-current assets consumes cash.
      investingItems.push({
        label: deltaLabel("Δ", d.accountName),
        amount: -d.rawDelta,
      });
    } else if (isNonCurrentLiability) {
      // Financing: borrowing sources cash.
      financingItems.push({
        label: deltaLabel("Δ", d.accountName),
        amount: -d.rawDelta,
      });
    } else if (d.accountType === "EQUITY") {
      // Financing: capital contributions / drawings.
      financingItems.push({
        label: deltaLabel("Δ", d.accountName),
        amount: -d.rawDelta,
      });
    } else if (isOtherAsset) {
      // Treat "Other Assets" as investing (rare).
      investingItems.push({
        label: deltaLabel("Δ", d.accountName),
        amount: -d.rawDelta,
      });
    } else if (isOtherLiability) {
      // Treat "Other Liabilities" as financing (rare).
      financingItems.push({
        label: deltaLabel("Δ", d.accountName),
        amount: -d.rawDelta,
      });
    }
  }

  const nonCashAdjustmentsTotal = operatingAdjustments.reduce(
    (s, a) => s + a.amount,
    0
  );
  const netCashFromOperating = netIncome + nonCashAdjustmentsTotal;
  const netCashFromInvesting = investingItems.reduce(
    (s, a) => s + a.amount,
    0
  );
  const netCashFromFinancing = financingItems.reduce(
    (s, a) => s + a.amount,
    0
  );
  const netChangeInCash =
    netCashFromOperating + netCashFromInvesting + netCashFromFinancing;

  return {
    beginningCashBalance,
    operating: {
      netIncome,
      nonCashAdjustments: operatingAdjustments,
      nonCashAdjustmentsTotal,
      netCashFromOperating,
    },
    investing: {
      items: investingItems,
      netCashFromInvesting,
    },
    financing: {
      items: financingItems,
      netCashFromFinancing,
    },
    netChangeInCash,
    endingCashBalance,
  };
}

function deltaLabel(prefix: string, name: string): string {
  return `${prefix} ${name}`;
}

// ─── Compare-period support ──────────────────────────────────────

export type CashFlowLineWithCompare = CashFlowLine & {
  previousAmount: number;
};

export type CashFlowStatementWithCompare = {
  beginningCashBalance: number;
  previousBeginningCashBalance: number;
  operating: {
    netIncome: number;
    previousNetIncome: number;
    nonCashAdjustments: CashFlowLineWithCompare[];
    nonCashAdjustmentsTotal: number;
    previousNonCashAdjustmentsTotal: number;
    netCashFromOperating: number;
    previousNetCashFromOperating: number;
  };
  investing: {
    items: CashFlowLineWithCompare[];
    netCashFromInvesting: number;
    previousNetCashFromInvesting: number;
  };
  financing: {
    items: CashFlowLineWithCompare[];
    netCashFromFinancing: number;
    previousNetCashFromFinancing: number;
  };
  netChangeInCash: number;
  previousNetChangeInCash: number;
  endingCashBalance: number;
  previousEndingCashBalance: number;
};

/**
 * Merge two single-period cash-flow statements into a compare-ready
 * structure. Line items are matched by label (since they're delta
 * lines like "Δ Accounts Receivable" with stable labels across
 * periods). Items in one period but not the other surface with
 * zero in the missing column.
 */
export function mergeCashFlowWithCompare(
  current: CashFlowStatement,
  previous: CashFlowStatement
): CashFlowStatementWithCompare {
  function mergeLines(
    cur: CashFlowLine[],
    prev: CashFlowLine[]
  ): CashFlowLineWithCompare[] {
    const prevByLabel = new Map(prev.map((l) => [l.label, l.amount]));
    const seen = new Set<string>();
    const out: CashFlowLineWithCompare[] = [];
    for (const l of cur) {
      out.push({ ...l, previousAmount: prevByLabel.get(l.label) ?? 0 });
      seen.add(l.label);
    }
    for (const l of prev) {
      if (seen.has(l.label)) continue;
      out.push({ ...l, amount: 0, previousAmount: l.amount });
    }
    return out;
  }
  return {
    beginningCashBalance: current.beginningCashBalance,
    previousBeginningCashBalance: previous.beginningCashBalance,
    operating: {
      netIncome: current.operating.netIncome,
      previousNetIncome: previous.operating.netIncome,
      nonCashAdjustments: mergeLines(
        current.operating.nonCashAdjustments,
        previous.operating.nonCashAdjustments
      ),
      nonCashAdjustmentsTotal: current.operating.nonCashAdjustmentsTotal,
      previousNonCashAdjustmentsTotal:
        previous.operating.nonCashAdjustmentsTotal,
      netCashFromOperating: current.operating.netCashFromOperating,
      previousNetCashFromOperating: previous.operating.netCashFromOperating,
    },
    investing: {
      items: mergeLines(current.investing.items, previous.investing.items),
      netCashFromInvesting: current.investing.netCashFromInvesting,
      previousNetCashFromInvesting: previous.investing.netCashFromInvesting,
    },
    financing: {
      items: mergeLines(current.financing.items, previous.financing.items),
      netCashFromFinancing: current.financing.netCashFromFinancing,
      previousNetCashFromFinancing: previous.financing.netCashFromFinancing,
    },
    netChangeInCash: current.netChangeInCash,
    previousNetChangeInCash: previous.netChangeInCash,
    endingCashBalance: current.endingCashBalance,
    previousEndingCashBalance: previous.endingCashBalance,
  };
}
