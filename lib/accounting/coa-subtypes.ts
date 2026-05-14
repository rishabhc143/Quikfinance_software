import type { AccountType } from "@prisma/client";

/**
 * ACCT-E.2 — Zoho-parity Chart of Accounts sub-types.
 *
 * The granular labels accountants pick when creating an account.
 * Driven by the broad `AccountType` enum: each type has a fixed
 * list of valid sub-type labels. The new + edit forms expose this
 * map so users see only the sub-types that match the type they
 * picked.
 *
 * Pure module — no Prisma imports beyond the AccountType enum.
 */

export const COA_SUBTYPES_BY_TYPE: Record<AccountType, string[]> = {
  ASSET: [
    "Cash",
    "Bank",
    "Accounts Receivable",
    "Other Current Asset",
    "Stock",
    "Fixed Asset",
    "Other Asset",
  ],
  LIABILITY: [
    "Accounts Payable",
    "Credit Card",
    "Other Current Liability",
    "Non Current Liability",
    "Other Liability",
  ],
  EQUITY: ["Equity"],
  INCOME: ["Income"],
  EXPENSE: ["Expense"],
  COST_OF_GOODS_SOLD: ["Cost Of Goods Sold"],
  OTHER_INCOME: ["Other Income"],
  OTHER_EXPENSE: ["Other Expense"],
};

/** Flat list of every valid sub-type, used by the create-action validator. */
export const ALL_VALID_SUBTYPES: string[] = Object.values(
  COA_SUBTYPES_BY_TYPE
).flat();

/**
 * True iff the given sub-type belongs to the given type's allowed
 * set. The action validator rejects mismatches so a UI bug can't
 * persist a (type=EXPENSE, subType="Cash") row.
 */
export function isValidSubTypeForType(
  type: AccountType,
  subType: string | null
): boolean {
  if (subType === null || subType === "") return true; // null is always fine
  return COA_SUBTYPES_BY_TYPE[type].includes(subType);
}

/**
 * Sub-type that's a sensible default for each broad type — used
 * to pre-select the new-account form so the user doesn't have to
 * pick twice for the common case.
 */
export const DEFAULT_SUBTYPE_FOR_TYPE: Record<AccountType, string> = {
  ASSET: "Other Current Asset",
  LIABILITY: "Other Current Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost Of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};
