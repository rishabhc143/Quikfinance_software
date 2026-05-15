import { describe, it, expect } from "vitest";
import {
  buildBalanceSheet,
  bucketFor,
  cashAndEquivalentsChildren,
  type BsAccountInput,
} from "@/lib/reports/balance-sheet";

/**
 * REPORTS — Pin the bucket-assignment rules + the 4-level Balance
 * Sheet rollup. Mis-bucketing an account silently mis-reports the
 * company's financial position, so every bucket branch gets a
 * dedicated case.
 */

function acct(p: Partial<BsAccountInput> & {
  accountName: string;
  accountType: BsAccountInput["accountType"];
}): BsAccountInput {
  return {
    accountId: p.accountName.toLowerCase().replace(/\s+/g, "-"),
    accountCode: null,
    accountSubType: null,
    netBalance: 0,
    ...p,
  };
}

describe("bucketFor — ASSET routing", () => {
  it("recognises 'Accounts Receivable' by exact name", () => {
    expect(
      bucketFor(acct({ accountName: "Accounts Receivable", accountType: "ASSET" }))
    ).toBe("current-assets-ar");
  });

  it("matches AR name case-insensitively", () => {
    expect(
      bucketFor(acct({ accountName: "accounts receivable", accountType: "ASSET" }))
    ).toBe("current-assets-ar");
  });

  it("routes Cash subType to current-assets-cash", () => {
    expect(
      bucketFor(
        acct({
          accountName: "Petty Cash",
          accountType: "ASSET",
          accountSubType: "Cash",
        })
      )
    ).toBe("current-assets-cash");
  });

  it("routes Bank subType to current-assets-bank", () => {
    expect(
      bucketFor(
        acct({
          accountName: "HDFC Current",
          accountType: "ASSET",
          accountSubType: "Bank",
        })
      )
    ).toBe("current-assets-bank");
  });

  it("routes Other Current Asset + Stock to current-assets-other", () => {
    expect(
      bucketFor(
        acct({
          accountName: "Prepaid Rent",
          accountType: "ASSET",
          accountSubType: "Other Current Asset",
        })
      )
    ).toBe("current-assets-other");
    expect(
      bucketFor(
        acct({
          accountName: "Inventory",
          accountType: "ASSET",
          accountSubType: "Stock",
        })
      )
    ).toBe("current-assets-other");
  });

  it("routes Fixed Asset subType to fixed-assets", () => {
    expect(
      bucketFor(
        acct({
          accountName: "Office Equipment",
          accountType: "ASSET",
          accountSubType: "Fixed Asset",
        })
      )
    ).toBe("fixed-assets");
  });

  it("routes Non Current Asset subType to non-current-assets", () => {
    expect(
      bucketFor(
        acct({
          accountName: "Long-term Investment",
          accountType: "ASSET",
          accountSubType: "Non Current Asset",
        })
      )
    ).toBe("non-current-assets");
  });

  it("falls back to other-assets for unrecognised asset subTypes", () => {
    expect(
      bucketFor(
        acct({ accountName: "Goodwill", accountType: "ASSET", accountSubType: null })
      )
    ).toBe("other-assets");
    expect(
      bucketFor(
        acct({
          accountName: "Goodwill",
          accountType: "ASSET",
          accountSubType: "Something Weird",
        })
      )
    ).toBe("other-assets");
  });
});

describe("bucketFor — LIABILITY routing", () => {
  it("recognises 'Accounts Payable' by exact name", () => {
    expect(
      bucketFor(acct({ accountName: "Accounts Payable", accountType: "LIABILITY" }))
    ).toBe("current-liabilities-ap");
  });

  it("routes Other Current Liability to current-liabilities-other", () => {
    expect(
      bucketFor(
        acct({
          accountName: "GST Payable",
          accountType: "LIABILITY",
          accountSubType: "Other Current Liability",
        })
      )
    ).toBe("current-liabilities-other");
  });

  it("routes Non Current Liability to non-current-liabilities", () => {
    expect(
      bucketFor(
        acct({
          accountName: "Long-term Loan",
          accountType: "LIABILITY",
          accountSubType: "Non Current Liability",
        })
      )
    ).toBe("non-current-liabilities");
  });

  it("falls back to other-liabilities for unrecognised liability subTypes", () => {
    expect(
      bucketFor(
        acct({ accountName: "Deferred Tax", accountType: "LIABILITY" })
      )
    ).toBe("other-liabilities");
  });
});

describe("bucketFor — EQUITY routing", () => {
  it("always routes to equities", () => {
    expect(
      bucketFor(acct({ accountName: "Capital", accountType: "EQUITY" }))
    ).toBe("equities");
    expect(
      bucketFor(
        acct({
          accountName: "Retained Earnings",
          accountType: "EQUITY",
          accountSubType: "Equity",
        })
      )
    ).toBe("equities");
  });
});

describe("buildBalanceSheet — empty", () => {
  it("returns full skeleton with zero totals when no inputs", () => {
    const bs = buildBalanceSheet([]);
    expect(bs.assets.total).toBe(0);
    expect(bs.assets.label).toBe("Assets");
    expect(bs.assets.groups).toHaveLength(4);
    expect(bs.assets.groups.map((g) => g.label)).toEqual([
      "Current Assets",
      "Non Current Assets",
      "Fixed Assets",
      "Other Assets",
    ]);
    expect(bs.liabilities.total).toBe(0);
    expect(bs.liabilities.groups.map((g) => g.label)).toEqual([
      "Current Liabilities",
      "Non Current Liabilities",
      "Other Liabilities",
    ]);
    expect(bs.equities.total).toBe(0);
    expect(bs.liabilitiesAndEquitiesTotal).toBe(0);
  });

  it("Cash and Cash Equivalents has Cash + Bank as children", () => {
    const bs = buildBalanceSheet([]);
    const currentAssets = bs.assets.groups[0];
    const cashAndEq = currentAssets.leaves[0];
    expect(cashAndEq.label).toBe("Cash and Cash Equivalents");
    const children = cashAndEquivalentsChildren(cashAndEq);
    expect(children).not.toBeNull();
    expect(children!.map((c) => c.label)).toEqual(["Cash", "Bank"]);
  });
});

describe("buildBalanceSheet — typical balanced books", () => {
  // Classic balanced sheet: cash + AR = AP + capital + retained earnings.
  const inputs: BsAccountInput[] = [
    {
      accountId: "petty-cash",
      accountName: "Petty Cash",
      accountCode: "1010",
      accountType: "ASSET",
      accountSubType: "Cash",
      netBalance: 50_000,
    },
    {
      accountId: "hdfc",
      accountName: "HDFC Current",
      accountCode: "1020",
      accountType: "ASSET",
      accountSubType: "Bank",
      netBalance: 200_000,
    },
    {
      accountId: "ar",
      accountName: "Accounts Receivable",
      accountCode: "SYS-AR",
      accountType: "ASSET",
      accountSubType: null,
      netBalance: 80_000,
    },
    {
      accountId: "office",
      accountName: "Office Equipment",
      accountCode: "1500",
      accountType: "ASSET",
      accountSubType: "Fixed Asset",
      netBalance: 120_000,
    },
    {
      accountId: "ap",
      accountName: "Accounts Payable",
      accountCode: "SYS-AP",
      accountType: "LIABILITY",
      accountSubType: null,
      netBalance: 40_000,
    },
    {
      accountId: "gst",
      accountName: "GST Payable",
      accountCode: "2200",
      accountType: "LIABILITY",
      accountSubType: "Other Current Liability",
      netBalance: 10_000,
    },
    {
      accountId: "capital",
      accountName: "Capital Stock",
      accountCode: "3000",
      accountType: "EQUITY",
      accountSubType: "Equity",
      netBalance: 300_000,
    },
    {
      accountId: "re",
      accountName: "Retained Earnings",
      accountCode: "3100",
      accountType: "EQUITY",
      accountSubType: "Equity",
      netBalance: 100_000,
    },
  ];

  const bs = buildBalanceSheet(inputs);

  it("Cash + Bank totals roll up into Cash and Cash Equivalents", () => {
    const currentAssets = bs.assets.groups[0];
    const cashAndEq = currentAssets.leaves[0];
    const children = cashAndEquivalentsChildren(cashAndEq)!;
    expect(children[0].label).toBe("Cash");
    expect(children[0].total).toBe(50_000);
    expect(children[1].label).toBe("Bank");
    expect(children[1].total).toBe(200_000);
    expect(cashAndEq.total).toBe(250_000);
  });

  it("Accounts Receivable leaf has the AR account", () => {
    const ar = bs.assets.groups[0].leaves[1];
    expect(ar.label).toBe("Accounts Receivable");
    expect(ar.total).toBe(80_000);
    expect(ar.accounts).toHaveLength(1);
    expect(ar.accounts[0].accountName).toBe("Accounts Receivable");
  });

  it("Current Assets total = Cash and Equivalents + AR + Other current", () => {
    expect(bs.assets.groups[0].total).toBe(250_000 + 80_000 + 0);
  });

  it("Fixed Assets total picks up Office Equipment", () => {
    expect(bs.assets.groups[2].total).toBe(120_000);
  });

  it("Assets total rolls up all four mid groups", () => {
    expect(bs.assets.total).toBe(250_000 + 80_000 + 0 + 0 + 120_000);
    // = 450,000
    expect(bs.assets.total).toBe(450_000);
  });

  it("Current Liabilities total = AP + Other Current Liabilities", () => {
    expect(bs.liabilities.groups[0].total).toBe(40_000 + 10_000);
  });

  it("Liabilities total rolls up all three mid groups", () => {
    expect(bs.liabilities.total).toBe(50_000);
  });

  it("Equities total = Capital + Retained Earnings", () => {
    expect(bs.equities.total).toBe(400_000);
  });

  it("Liabilities + Equities total = Assets total when books balance", () => {
    expect(bs.liabilitiesAndEquitiesTotal).toBe(bs.assets.total);
    expect(bs.liabilitiesAndEquitiesTotal).toBe(450_000);
  });
});

describe("buildBalanceSheet — sort + zero-balance handling", () => {
  it("accounts within a leaf sort by code then name", () => {
    const bs = buildBalanceSheet([
      {
        accountId: "z",
        accountName: "ZZZ Other",
        accountCode: "1900",
        accountType: "ASSET",
        accountSubType: "Other Current Asset",
        netBalance: 100,
      },
      {
        accountId: "a",
        accountName: "AAA Other",
        accountCode: "1100",
        accountType: "ASSET",
        accountSubType: "Other Current Asset",
        netBalance: 200,
      },
    ]);
    const otherCurrent = bs.assets.groups[0].leaves[2];
    expect(otherCurrent.label).toBe("Other current assets");
    expect(otherCurrent.accounts[0].accountCode).toBe("1100");
    expect(otherCurrent.accounts[1].accountCode).toBe("1900");
  });

  it("keeps zero-balance accounts in the structure (matches Zoho)", () => {
    const bs = buildBalanceSheet([
      {
        accountId: "petty",
        accountName: "Petty Cash",
        accountCode: "1010",
        accountType: "ASSET",
        accountSubType: "Cash",
        netBalance: 0,
      },
    ]);
    const cashLeaf = cashAndEquivalentsChildren(
      bs.assets.groups[0].leaves[0]
    )![0];
    expect(cashLeaf.accounts).toHaveLength(1);
    expect(cashLeaf.total).toBe(0);
  });
});
