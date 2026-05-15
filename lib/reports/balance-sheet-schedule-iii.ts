/**
 * REPORTS — Balance Sheet (Schedule III).
 *
 * Companies Act 2013 mandated Indian Balance Sheet format. Unlike
 * our Zoho-style Balance Sheet (which uses Assets / Liabilities &
 * Equities top-level groupings), Schedule III prescribes a two-
 * column "EQUITY AND LIABILITIES" / "ASSETS" layout with strict
 * numbered sub-sections.
 *
 * Layout (matches the Companies Act 2013, Schedule III, Part I):
 *
 *  I.   EQUITY AND LIABILITIES
 *   1.  Shareholders' Funds
 *       (a) Share Capital
 *       (b) Reserves and Surplus
 *       (c) Money received against share warrants
 *   2.  Share application money pending allotment
 *   3.  Non-Current Liabilities
 *       (a) Long-term borrowings
 *       (b) Deferred tax liabilities (Net)
 *       (c) Other Long term liabilities
 *       (d) Long term provisions
 *   4.  Current Liabilities
 *       (a) Short-term borrowings
 *       (b) Trade payables
 *       (c) Other current liabilities
 *       (d) Short-term provisions
 *       Total Equity and Liabilities
 *
 *  II.  ASSETS
 *   1.  Non-current assets
 *       (a) Fixed assets
 *           (i)   Tangible assets
 *           (ii)  Intangible assets
 *           (iii) Capital work-in-progress
 *           (iv)  Intangible assets under development
 *       (b) Non-current investments
 *       (c) Deferred tax assets (Net)
 *       (d) Long-term loans and advances
 *       (e) Other non-current assets
 *   2.  Current assets
 *       (a) Current investments
 *       (b) Inventories
 *       (c) Trade receivables
 *       (d) Cash and cash equivalents
 *       (e) Short-term loans and advances
 *       (f) Other current assets
 *       Total Assets
 *
 * Account routing uses our existing `subType` field (Cash / Bank /
 * Stock / Fixed Asset / Non Current Asset / Other Current Asset /
 * Non Current Liability / Other Current Liability / Equity) plus
 * name heuristics for the deeper sub-categories.
 *
 * Pure module — no DB. Caller queries journal entries, runs them
 * through aggregateLedgerLines, hands rows in.
 */

import type { AccountBucket } from "./ledger-aggregation";

export type Sch3BsBucket =
  // Equity & Liabilities
  | "share-capital"
  | "reserves-and-surplus"
  | "money-against-share-warrants"
  | "share-application-pending"
  | "long-term-borrowings"
  | "deferred-tax-liabilities"
  | "other-long-term-liabilities"
  | "long-term-provisions"
  | "short-term-borrowings"
  | "trade-payables"
  | "other-current-liabilities"
  | "short-term-provisions"
  // Assets
  | "tangible-assets"
  | "intangible-assets"
  | "capital-work-in-progress"
  | "intangible-assets-under-development"
  | "non-current-investments"
  | "deferred-tax-assets"
  | "long-term-loans-and-advances"
  | "other-non-current-assets"
  | "current-investments"
  | "inventories"
  | "trade-receivables"
  | "cash-and-cash-equivalents"
  | "short-term-loans-and-advances"
  | "other-current-assets";

export function bucketForSch3Bs(input: {
  accountType: AccountBucket;
  accountName: string;
  accountSubType: string | null;
}): Sch3BsBucket {
  const name = input.accountName.trim().toLowerCase();
  const subType = (input.accountSubType ?? "").trim();

  // ── Equity ──
  if (input.accountType === "EQUITY") {
    if (
      name.includes("share capital") ||
      name === "share capital" ||
      name === "equity share capital" ||
      name === "capital"
    ) {
      return "share-capital";
    }
    if (
      name.includes("share warrant") ||
      name.includes("warrants pending")
    ) {
      return "money-against-share-warrants";
    }
    if (
      name.includes("share application") ||
      name.includes("application money")
    ) {
      return "share-application-pending";
    }
    // Default equity (retained earnings, reserves) → Reserves & Surplus
    return "reserves-and-surplus";
  }

  // ── Liabilities ──
  if (input.accountType === "LIABILITY") {
    // Trade payables — by name only since our schema has "Accounts Payable"
    if (
      name === "accounts payable" ||
      name === "trade payables" ||
      name.includes("creditors") ||
      name.includes("vendor payable")
    ) {
      return "trade-payables";
    }
    // Deferred tax liability — explicit name match
    if (
      name.includes("deferred tax") &&
      (name.includes("liabil") || name.includes("payable"))
    ) {
      return "deferred-tax-liabilities";
    }
    // Non-current grouping
    if (subType === "Non Current Liability") {
      if (
        name.includes("loan") ||
        name.includes("borrow") ||
        name.includes("debenture") ||
        name.includes("bond")
      ) {
        return "long-term-borrowings";
      }
      if (name.includes("provision")) return "long-term-provisions";
      return "other-long-term-liabilities";
    }
    // Current grouping (Other Current Liability subType or default)
    if (
      name.includes("short term") &&
      (name.includes("loan") || name.includes("borrow"))
    ) {
      return "short-term-borrowings";
    }
    if (name.includes("provision")) return "short-term-provisions";
    return "other-current-liabilities";
  }

  // ── Assets ──
  if (input.accountType === "ASSET") {
    // Cash & bank (the simplest leaf)
    if (subType === "Cash" || subType === "Bank") {
      return "cash-and-cash-equivalents";
    }
    // Trade receivables
    if (
      name === "accounts receivable" ||
      name === "trade receivables" ||
      name.includes("debtors")
    ) {
      return "trade-receivables";
    }
    // Inventory / stock
    if (
      subType === "Stock" ||
      name.includes("inventory") ||
      name.includes("inventories") ||
      name.includes("stock-in-trade")
    ) {
      return "inventories";
    }
    // Deferred tax asset
    if (name.includes("deferred tax") && name.includes("asset")) {
      return "deferred-tax-assets";
    }
    // Non-current assets routing
    if (subType === "Fixed Asset" || subType === "Non Current Asset") {
      if (
        name.includes("intangible") &&
        (name.includes("development") || name.includes("under develop"))
      ) {
        return "intangible-assets-under-development";
      }
      if (name.includes("capital work") || name.includes("cwip")) {
        return "capital-work-in-progress";
      }
      if (
        name.includes("intangible") ||
        name.includes("goodwill") ||
        name.includes("patent") ||
        name.includes("trademark") ||
        name.includes("software") ||
        name.includes("copyright")
      ) {
        return "intangible-assets";
      }
      if (
        name.includes("investment") &&
        (name.includes("long term") || name.includes("non current"))
      ) {
        return "non-current-investments";
      }
      if (subType === "Non Current Asset") {
        if (name.includes("loan") || name.includes("advance")) {
          return "long-term-loans-and-advances";
        }
        return "other-non-current-assets";
      }
      // Default Fixed Asset → Tangible Assets
      return "tangible-assets";
    }
    // Current assets routing (Other Current Asset or unmatched)
    if (
      name.includes("current investment") ||
      (name.includes("investment") && name.includes("short"))
    ) {
      return "current-investments";
    }
    if (name.includes("loan") || name.includes("advance")) {
      return "short-term-loans-and-advances";
    }
    return "other-current-assets";
  }

  // Defensive fallback — INCOME / EXPENSE etc. shouldn't appear in
  // a Balance Sheet query, but route them somewhere safe.
  return "other-current-assets";
}

export type Sch3BsAmounts = Record<Sch3BsBucket, number>;

export function emptySch3BsAmounts(): Sch3BsAmounts {
  return {
    "share-capital": 0,
    "reserves-and-surplus": 0,
    "money-against-share-warrants": 0,
    "share-application-pending": 0,
    "long-term-borrowings": 0,
    "deferred-tax-liabilities": 0,
    "other-long-term-liabilities": 0,
    "long-term-provisions": 0,
    "short-term-borrowings": 0,
    "trade-payables": 0,
    "other-current-liabilities": 0,
    "short-term-provisions": 0,
    "tangible-assets": 0,
    "intangible-assets": 0,
    "capital-work-in-progress": 0,
    "intangible-assets-under-development": 0,
    "non-current-investments": 0,
    "deferred-tax-assets": 0,
    "long-term-loans-and-advances": 0,
    "other-non-current-assets": 0,
    "current-investments": 0,
    "inventories": 0,
    "trade-receivables": 0,
    "cash-and-cash-equivalents": 0,
    "short-term-loans-and-advances": 0,
    "other-current-assets": 0,
  };
}

export type Sch3BalanceSheet = {
  equityAndLiabilities: {
    shareholdersFunds: {
      shareCapital: number;
      reservesAndSurplus: number;
      moneyAgainstShareWarrants: number;
      total: number;
    };
    shareApplicationPending: number;
    nonCurrentLiabilities: {
      longTermBorrowings: number;
      deferredTaxLiabilities: number;
      otherLongTermLiabilities: number;
      longTermProvisions: number;
      total: number;
    };
    currentLiabilities: {
      shortTermBorrowings: number;
      tradePayables: number;
      otherCurrentLiabilities: number;
      shortTermProvisions: number;
      total: number;
    };
    /** I. total */
    total: number;
  };
  assets: {
    nonCurrentAssets: {
      fixedAssets: {
        tangibleAssets: number;
        intangibleAssets: number;
        capitalWorkInProgress: number;
        intangibleAssetsUnderDevelopment: number;
        total: number;
      };
      nonCurrentInvestments: number;
      deferredTaxAssets: number;
      longTermLoansAndAdvances: number;
      otherNonCurrentAssets: number;
      total: number;
    };
    currentAssets: {
      currentInvestments: number;
      inventories: number;
      tradeReceivables: number;
      cashAndCashEquivalents: number;
      shortTermLoansAndAdvances: number;
      otherCurrentAssets: number;
      total: number;
    };
    /** II. total */
    total: number;
  };
};

export type Sch3BsInput = {
  accountType: AccountBucket;
  accountName: string;
  accountSubType: string | null;
  /** Signed positive = natural balance (per ledger-aggregation convention). */
  netBalance: number;
};

export function buildScheduleIIIBalanceSheet(
  inputs: Sch3BsInput[]
): Sch3BalanceSheet {
  const amounts = emptySch3BsAmounts();
  for (const i of inputs) {
    if (i.netBalance === 0) continue;
    const bucket = bucketForSch3Bs({
      accountType: i.accountType,
      accountName: i.accountName,
      accountSubType: i.accountSubType,
    });
    amounts[bucket] += i.netBalance;
  }

  const shareholdersFundsTotal =
    amounts["share-capital"] +
    amounts["reserves-and-surplus"] +
    amounts["money-against-share-warrants"];
  const nonCurrentLiabilitiesTotal =
    amounts["long-term-borrowings"] +
    amounts["deferred-tax-liabilities"] +
    amounts["other-long-term-liabilities"] +
    amounts["long-term-provisions"];
  const currentLiabilitiesTotal =
    amounts["short-term-borrowings"] +
    amounts["trade-payables"] +
    amounts["other-current-liabilities"] +
    amounts["short-term-provisions"];
  const equityAndLiabilitiesTotal =
    shareholdersFundsTotal +
    amounts["share-application-pending"] +
    nonCurrentLiabilitiesTotal +
    currentLiabilitiesTotal;

  const fixedAssetsTotal =
    amounts["tangible-assets"] +
    amounts["intangible-assets"] +
    amounts["capital-work-in-progress"] +
    amounts["intangible-assets-under-development"];
  const nonCurrentAssetsTotal =
    fixedAssetsTotal +
    amounts["non-current-investments"] +
    amounts["deferred-tax-assets"] +
    amounts["long-term-loans-and-advances"] +
    amounts["other-non-current-assets"];
  const currentAssetsTotal =
    amounts["current-investments"] +
    amounts["inventories"] +
    amounts["trade-receivables"] +
    amounts["cash-and-cash-equivalents"] +
    amounts["short-term-loans-and-advances"] +
    amounts["other-current-assets"];
  const assetsTotal = nonCurrentAssetsTotal + currentAssetsTotal;

  return {
    equityAndLiabilities: {
      shareholdersFunds: {
        shareCapital: amounts["share-capital"],
        reservesAndSurplus: amounts["reserves-and-surplus"],
        moneyAgainstShareWarrants: amounts["money-against-share-warrants"],
        total: shareholdersFundsTotal,
      },
      shareApplicationPending: amounts["share-application-pending"],
      nonCurrentLiabilities: {
        longTermBorrowings: amounts["long-term-borrowings"],
        deferredTaxLiabilities: amounts["deferred-tax-liabilities"],
        otherLongTermLiabilities: amounts["other-long-term-liabilities"],
        longTermProvisions: amounts["long-term-provisions"],
        total: nonCurrentLiabilitiesTotal,
      },
      currentLiabilities: {
        shortTermBorrowings: amounts["short-term-borrowings"],
        tradePayables: amounts["trade-payables"],
        otherCurrentLiabilities: amounts["other-current-liabilities"],
        shortTermProvisions: amounts["short-term-provisions"],
        total: currentLiabilitiesTotal,
      },
      total: equityAndLiabilitiesTotal,
    },
    assets: {
      nonCurrentAssets: {
        fixedAssets: {
          tangibleAssets: amounts["tangible-assets"],
          intangibleAssets: amounts["intangible-assets"],
          capitalWorkInProgress: amounts["capital-work-in-progress"],
          intangibleAssetsUnderDevelopment:
            amounts["intangible-assets-under-development"],
          total: fixedAssetsTotal,
        },
        nonCurrentInvestments: amounts["non-current-investments"],
        deferredTaxAssets: amounts["deferred-tax-assets"],
        longTermLoansAndAdvances: amounts["long-term-loans-and-advances"],
        otherNonCurrentAssets: amounts["other-non-current-assets"],
        total: nonCurrentAssetsTotal,
      },
      currentAssets: {
        currentInvestments: amounts["current-investments"],
        inventories: amounts["inventories"],
        tradeReceivables: amounts["trade-receivables"],
        cashAndCashEquivalents: amounts["cash-and-cash-equivalents"],
        shortTermLoansAndAdvances: amounts["short-term-loans-and-advances"],
        otherCurrentAssets: amounts["other-current-assets"],
        total: currentAssetsTotal,
      },
      total: assetsTotal,
    },
  };
}

