/**
 * REPORTS — Pure builder that turns aggregated ledger rows (as of a
 * single point in time) into the Zoho-style 4-level Balance Sheet
 * structure:
 *
 *   Assets
 *     Current Assets
 *       Cash and Cash Equivalents
 *         Cash         → Total for Cash
 *         Bank         → Total for Bank
 *         Total for Cash and Cash Equivalents
 *       Accounts Receivable → Total for Accounts Receivable
 *       Other current assets → Total for Other current assets
 *       Total for Current Assets
 *     Non Current Assets → Total for Non Current Assets
 *     Fixed Assets       → Total for Fixed Assets
 *     Other Assets       → Total for Other Assets
 *     Total for Assets
 *
 *   Liabilities & Equities
 *     Liabilities
 *       Current Liabilities
 *         Accounts Payable → Total for Accounts Payable
 *         Other Current Liabilities → Total for Other Current Liabilities
 *         Total for Current Liabilities
 *       Non Current Liabilities → Total for Non Current Liabilities
 *       Other Liabilities → Total for Other Liabilities
 *       Total for Liabilities
 *     Equities → Total for Equities
 *     Total for Liabilities & Equities
 *
 * No DB calls — the caller queries the lines (where date <= asOf),
 * runs `aggregateLedgerLines`, and hands rows in. Vitest-friendly.
 */

import type { LedgerRow } from "./ledger-aggregation";

export type BsAccountRow = {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  amount: number;
};

/** Innermost grouping ("Cash", "Bank", "Accounts Payable", etc.). */
export type BsLeafGroup = {
  label: string;
  accounts: BsAccountRow[];
  total: number;
};

/** Mid-level grouping that contains either leaves or direct accounts. */
export type BsMidGroup = {
  label: string;
  /** Leaf sub-groups (e.g. Cash + Bank under Cash and Cash Equivalents). */
  leaves: BsLeafGroup[];
  /** Accounts directly in this mid-group (no leaf wrapper). */
  accounts: BsAccountRow[];
  total: number;
};

export type BsTopGroup = {
  label: string;
  /** Mid-level sub-groups (Current Assets, Fixed Assets, etc.). */
  groups: BsMidGroup[];
  total: number;
};

export type BalanceSheet = {
  assets: BsTopGroup;
  liabilities: BsTopGroup;
  equities: BsMidGroup;
  /** Liabilities total + Equities total. Should equal Assets total when the books balance. */
  liabilitiesAndEquitiesTotal: number;
};

// Bucket assignment from CoA row → BS path. Pure functions so tests
// can exercise the routing logic without touching the database.

type Bucket =
  | "current-assets-cash"
  | "current-assets-bank"
  | "current-assets-ar"
  | "current-assets-other"
  | "non-current-assets"
  | "fixed-assets"
  | "other-assets"
  | "current-liabilities-ap"
  | "current-liabilities-other"
  | "non-current-liabilities"
  | "other-liabilities"
  | "equities";

export type BsAccountInput = {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  accountType: LedgerRow["accountType"];
  /** Sub-type label from `ChartOfAccount.subType`. */
  accountSubType: string | null;
  /** Signed by accounting convention — see ledger-aggregation. */
  netBalance: number;
};

/**
 * Assign one CoA row to a Balance Sheet bucket. Rules:
 *
 *   - ASSET: name "Accounts Receivable" → AR bucket. Else subType
 *     drives it: "Cash" → cash, "Bank" → bank, "Other Current Asset"
 *     / "Stock" → other current assets, "Fixed Asset" → fixed,
 *     "Non Current Asset" → non-current, anything else → other-assets.
 *   - LIABILITY: name "Accounts Payable" → AP bucket. Else subType:
 *     "Other Current Liability" → current-other,
 *     "Non Current Liability" → non-current, else → other-liabilities.
 *   - EQUITY: always equities.
 */
export function bucketFor(input: BsAccountInput): Bucket {
  const subType = (input.accountSubType ?? "").trim();
  const name = input.accountName.trim().toLowerCase();

  if (input.accountType === "ASSET") {
    if (name === "accounts receivable") return "current-assets-ar";
    if (subType === "Cash") return "current-assets-cash";
    if (subType === "Bank") return "current-assets-bank";
    if (subType === "Other Current Asset" || subType === "Stock") {
      return "current-assets-other";
    }
    if (subType === "Fixed Asset") return "fixed-assets";
    if (subType === "Non Current Asset") return "non-current-assets";
    return "other-assets";
  }

  if (input.accountType === "LIABILITY") {
    if (name === "accounts payable") return "current-liabilities-ap";
    if (subType === "Other Current Liability") return "current-liabilities-other";
    if (subType === "Non Current Liability") return "non-current-liabilities";
    return "other-liabilities";
  }

  // EQUITY (and any defensive fallback).
  return "equities";
}

/** Sort by code (numeric-aware) then name; consistent with P&L. */
function sortAccounts(a: BsAccountRow, b: BsAccountRow): number {
  return (a.accountCode ?? a.accountName).localeCompare(
    b.accountCode ?? b.accountName,
    undefined,
    { numeric: true }
  );
}

function emptyLeaf(label: string): BsLeafGroup {
  return { label, accounts: [], total: 0 };
}
function emptyMid(label: string): BsMidGroup {
  return { label, leaves: [], accounts: [], total: 0 };
}

function finalizeLeaf(g: BsLeafGroup): BsLeafGroup {
  g.accounts.sort(sortAccounts);
  g.total = g.accounts.reduce((s, a) => s + a.amount, 0);
  return g;
}
function finalizeMid(g: BsMidGroup): BsMidGroup {
  g.accounts.sort(sortAccounts);
  let total = g.accounts.reduce((s, a) => s + a.amount, 0);
  for (const leaf of g.leaves) {
    finalizeLeaf(leaf);
    total += leaf.total;
  }
  g.total = total;
  return g;
}

/**
 * Build the full Balance Sheet structure from a flat list of
 * accounts with their net balances as of the report date.
 *
 * Zero-balance accounts are kept in the structure so the section
 * headers always appear (matches Zoho's behaviour — empty sections
 * still render a "Total for X: 0.00" row).
 */
export function buildBalanceSheet(inputs: BsAccountInput[]): BalanceSheet {
  // Build the section skeleton (so empty sections still render).
  const currentAssets = emptyMid("Current Assets");
  const cashAndEquivalents = emptyLeaf("Cash and Cash Equivalents");
  const cashLeaf = emptyLeaf("Cash");
  const bankLeaf = emptyLeaf("Bank");
  const arLeaf = emptyLeaf("Accounts Receivable");
  const otherCurrentLeaf = emptyLeaf("Other current assets");

  const nonCurrentAssets = emptyMid("Non Current Assets");
  const fixedAssets = emptyMid("Fixed Assets");
  const otherAssets = emptyMid("Other Assets");

  const currentLiabilities = emptyMid("Current Liabilities");
  const apLeaf = emptyLeaf("Accounts Payable");
  const otherCurrentLiabLeaf = emptyLeaf("Other Current Liabilities");

  const nonCurrentLiabilities = emptyMid("Non Current Liabilities");
  const otherLiabilities = emptyMid("Other Liabilities");
  const equities = emptyMid("Equities");

  for (const i of inputs) {
    const row: BsAccountRow = {
      accountId: i.accountId,
      accountName: i.accountName,
      accountCode: i.accountCode,
      amount: i.netBalance,
    };
    const bucket = bucketFor(i);
    switch (bucket) {
      case "current-assets-cash":
        cashLeaf.accounts.push(row);
        break;
      case "current-assets-bank":
        bankLeaf.accounts.push(row);
        break;
      case "current-assets-ar":
        arLeaf.accounts.push(row);
        break;
      case "current-assets-other":
        otherCurrentLeaf.accounts.push(row);
        break;
      case "non-current-assets":
        nonCurrentAssets.accounts.push(row);
        break;
      case "fixed-assets":
        fixedAssets.accounts.push(row);
        break;
      case "other-assets":
        otherAssets.accounts.push(row);
        break;
      case "current-liabilities-ap":
        apLeaf.accounts.push(row);
        break;
      case "current-liabilities-other":
        otherCurrentLiabLeaf.accounts.push(row);
        break;
      case "non-current-liabilities":
        nonCurrentLiabilities.accounts.push(row);
        break;
      case "other-liabilities":
        otherLiabilities.accounts.push(row);
        break;
      case "equities":
        equities.accounts.push(row);
        break;
    }
  }

  // Wire up the hierarchy:
  //   Current Assets contains TWO leaves (Cash and Cash Equivalents,
  //   Accounts Receivable, Other current assets) — but
  //   "Cash and Cash Equivalents" itself contains the nested Cash +
  //   Bank leaves which need their own totals. We finalise those
  //   first so the parent leaf's total picks them up.
  finalizeLeaf(cashLeaf);
  finalizeLeaf(bankLeaf);
  cashAndEquivalents.accounts = []; // no direct accounts at this level
  cashAndEquivalents.total = cashLeaf.total + bankLeaf.total;

  // We can't model 3 levels in a single BsLeafGroup, so we fake the
  // "Cash and Cash Equivalents" parent by storing it in
  // `currentAssets.leaves` along with the Cash + Bank as separate
  // entries — but the consumer needs the parent total. We'll model
  // this by keeping all three leaves directly under currentAssets;
  // the page component renders the nesting visually using indent.
  // Simpler: model Cash and Cash Equivalents as a wrapper container
  // whose presentation puts Cash + Bank under it. We use a custom
  // shape below.
  currentAssets.leaves = [
    cashAndEquivalents,
    arLeaf,
    otherCurrentLeaf,
  ];
  // Bolt cash + bank leaves onto the parent for the page renderer.
  (cashAndEquivalents as BsLeafGroup & { children?: BsLeafGroup[] }).children = [
    cashLeaf,
    bankLeaf,
  ];

  finalizeLeaf(arLeaf);
  finalizeLeaf(otherCurrentLeaf);
  currentAssets.total =
    cashAndEquivalents.total + arLeaf.total + otherCurrentLeaf.total;

  finalizeMid(nonCurrentAssets);
  finalizeMid(fixedAssets);
  finalizeMid(otherAssets);

  const assets: BsTopGroup = {
    label: "Assets",
    groups: [currentAssets, nonCurrentAssets, fixedAssets, otherAssets],
    total:
      currentAssets.total +
      nonCurrentAssets.total +
      fixedAssets.total +
      otherAssets.total,
  };

  // Liabilities side
  finalizeLeaf(apLeaf);
  finalizeLeaf(otherCurrentLiabLeaf);
  currentLiabilities.leaves = [apLeaf, otherCurrentLiabLeaf];
  currentLiabilities.total = apLeaf.total + otherCurrentLiabLeaf.total;

  finalizeMid(nonCurrentLiabilities);
  finalizeMid(otherLiabilities);

  const liabilities: BsTopGroup = {
    label: "Liabilities",
    groups: [currentLiabilities, nonCurrentLiabilities, otherLiabilities],
    total:
      currentLiabilities.total +
      nonCurrentLiabilities.total +
      otherLiabilities.total,
  };

  finalizeMid(equities);

  return {
    assets,
    liabilities,
    equities,
    liabilitiesAndEquitiesTotal: liabilities.total + equities.total,
  };
}

/** Convenience for the page renderer — get the nested Cash + Bank
 *  children that we bolted onto the Cash and Cash Equivalents leaf. */
export function cashAndEquivalentsChildren(
  leaf: BsLeafGroup
): BsLeafGroup[] | null {
  const withChildren = leaf as BsLeafGroup & { children?: BsLeafGroup[] };
  return withChildren.children ?? null;
}
