import { describe, it, expect } from "vitest";
import {
  DEFAULT_ACCOUNTS,
  type DefaultAccountSpec,
} from "@/lib/accounting/coa-defaults";

/**
 * ACCT-E — Tests for the default-account spec. The DB-touching
 * seeder is integration-tested via Playwright; this file pins
 * invariants on the static list so a future edit can't introduce
 * duplicates, type collisions, or empty rows.
 */

describe("DEFAULT_ACCOUNTS — list shape", () => {
  it("has ~60 entries (sanity check that nothing was wiped)", () => {
    expect(DEFAULT_ACCOUNTS.length).toBeGreaterThanOrEqual(55);
    expect(DEFAULT_ACCOUNTS.length).toBeLessThanOrEqual(80);
  });

  it("every entry has a non-empty name", () => {
    for (const a of DEFAULT_ACCOUNTS) {
      expect(a.name.length).toBeGreaterThan(0);
    }
  });

  it("names are unique (no duplicate seed rows)", () => {
    const names = DEFAULT_ACCOUNTS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every entry has a valid AccountType enum value", () => {
    const validTypes = new Set([
      "ASSET",
      "LIABILITY",
      "EQUITY",
      "INCOME",
      "EXPENSE",
      "COST_OF_GOODS_SOLD",
      "OTHER_INCOME",
      "OTHER_EXPENSE",
    ]);
    for (const a of DEFAULT_ACCOUNTS) {
      expect(validTypes.has(a.type)).toBe(true);
    }
  });
});

describe("DEFAULT_ACCOUNTS — SYS-* collision avoidance", () => {
  // These five names belong to lazy-created SYS-* system accounts;
  // including them in the default seed would create duplicates the
  // first time a posting flow ran. The list explicitly omits them.
  const SYS_COLLISIONS = [
    "Accounts Receivable",
    "Accounts Payable",
    "Sales",
    "Bad Debt",
    "Exchange Gain or Loss",
  ];

  it.each(SYS_COLLISIONS)(
    "does not include %s (collides with a SYS-* account)",
    (name) => {
      expect(DEFAULT_ACCOUNTS.find((a) => a.name === name)).toBeUndefined();
    }
  );
});

describe("DEFAULT_ACCOUNTS — spot checks", () => {
  function byName(name: string): DefaultAccountSpec | undefined {
    return DEFAULT_ACCOUNTS.find((a) => a.name === name);
  }

  it("Employee Advance is an Other Current Asset (ASSET)", () => {
    const a = byName("Employee Advance");
    expect(a?.type).toBe("ASSET");
    expect(a?.subType).toBe("Other Current Asset");
  });

  it("Petty Cash + Undeposited Funds are Cash (ASSET)", () => {
    for (const name of ["Petty Cash", "Undeposited Funds"]) {
      const a = byName(name);
      expect(a?.type).toBe("ASSET");
      expect(a?.subType).toBe("Cash");
    }
  });

  it("Inventory Asset is Stock (ASSET)", () => {
    const a = byName("Inventory Asset");
    expect(a?.type).toBe("ASSET");
    expect(a?.subType).toBe("Stock");
  });

  it("Mortgages + Construction Loans are Non Current Liability", () => {
    for (const name of ["Mortgages", "Construction Loans"]) {
      const a = byName(name);
      expect(a?.type).toBe("LIABILITY");
      expect(a?.subType).toBe("Non Current Liability");
    }
  });

  it("Cost of Goods Sold + Labor + Materials all carry COST_OF_GOODS_SOLD", () => {
    for (const name of ["Cost of Goods Sold", "Labor", "Materials"]) {
      const a = byName(name);
      expect(a?.type).toBe("COST_OF_GOODS_SOLD");
      expect(a?.subType).toBe("Cost Of Goods Sold");
    }
  });

  it("Equity accounts all share the same subType", () => {
    const equityAccounts = DEFAULT_ACCOUNTS.filter((a) => a.type === "EQUITY");
    expect(equityAccounts.length).toBeGreaterThan(0);
    for (const a of equityAccounts) {
      expect(a.subType).toBe("Equity");
    }
  });
});

describe("DEFAULT_ACCOUNTS — locked-flag invariants", () => {
  it("some entries are locked + some are not (mirrors the reference's mixed list)", () => {
    const locked = DEFAULT_ACCOUNTS.filter((a) => a.locked === true);
    const unlocked = DEFAULT_ACCOUNTS.filter((a) => a.locked !== true);
    expect(locked.length).toBeGreaterThan(0);
    expect(unlocked.length).toBeGreaterThan(0);
  });

  it("Travel Expense is NOT locked (reference shows a checkbox here)", () => {
    const a = DEFAULT_ACCOUNTS.find((x) => x.name === "Travel Expense");
    expect(a?.locked ?? false).toBe(false);
  });

  it("Petty Cash IS locked (reference shows a lock icon)", () => {
    const a = DEFAULT_ACCOUNTS.find((x) => x.name === "Petty Cash");
    expect(a?.locked).toBe(true);
  });
});
