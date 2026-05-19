import type { AccountType } from "@prisma/client";

/**
 * ACCT-E.2 — Chart of Accounts sub-types.
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

/**
 * ACCT-E.3 — Flat option list for the "Create Account" modal.
 *
 * The reference new-account UI shows one Account Type dropdown with all
 * granular labels at once (Cash / Bank / Other Asset / etc.) and
 * a contextual help panel that updates when the selection changes.
 *
 * Each option carries:
 *   - `value` — the broad+sub coded as `TYPE:SUBTYPE` so the form
 *     can serialize it into a single hidden field and the server
 *     action can split it back.
 *   - `label` — the granular display name (matches the reference).
 *   - `type` — broad AccountType for the DB column.
 *   - `subType` — granular label for the DB column.
 *   - `groupHeader` — short broad-type heading the help panel renders.
 *   - `description` — one-line context the help panel renders.
 *
 * Order matches the way the reference groups + lists its options.
 */
export type AccountTypeOption = {
  value: string;
  label: string;
  type: AccountType;
  subType: string;
  groupHeader: string;
  description: string;
};

export const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
  // ───── Asset ─────
  {
    value: "ASSET:Cash",
    label: "Cash",
    type: "ASSET",
    subType: "Cash",
    groupHeader: "Asset",
    description:
      "Track cash on hand: petty cash, undeposited funds, vault balances.",
  },
  {
    value: "ASSET:Bank",
    label: "Bank",
    type: "ASSET",
    subType: "Bank",
    groupHeader: "Asset",
    description:
      "Track bank-account balances — checking, savings, operating accounts.",
  },
  {
    value: "ASSET:Accounts Receivable",
    label: "Accounts Receivable",
    type: "ASSET",
    subType: "Accounts Receivable",
    groupHeader: "Asset",
    description:
      "Track amounts owed to you by customers from issued invoices.",
  },
  {
    value: "ASSET:Other Current Asset",
    label: "Other Current Asset",
    type: "ASSET",
    subType: "Other Current Asset",
    groupHeader: "Asset",
    description:
      "Short-term receivables — prepaid expenses, employee advances, recoverable tax.",
  },
  {
    value: "ASSET:Stock",
    label: "Stock",
    type: "ASSET",
    subType: "Stock",
    groupHeader: "Asset",
    description:
      "Track the cost of inventory held for resale.",
  },
  {
    value: "ASSET:Fixed Asset",
    label: "Fixed Asset",
    type: "ASSET",
    subType: "Fixed Asset",
    groupHeader: "Asset",
    description:
      "Long-lived physical assets — furniture, equipment, machinery, vehicles.",
  },
  {
    value: "ASSET:Other Asset",
    label: "Other Asset",
    type: "ASSET",
    subType: "Other Asset",
    groupHeader: "Asset",
    description:
      "Track special assets like goodwill and other intangible assets.",
  },

  // ───── Liability ─────
  {
    value: "LIABILITY:Accounts Payable",
    label: "Accounts Payable",
    type: "LIABILITY",
    subType: "Accounts Payable",
    groupHeader: "Liability",
    description:
      "Track amounts you owe vendors for bills received but not yet paid.",
  },
  {
    value: "LIABILITY:Credit Card",
    label: "Credit Card",
    type: "LIABILITY",
    subType: "Credit Card",
    groupHeader: "Liability",
    description: "Track company credit-card balances and charges.",
  },
  {
    value: "LIABILITY:Other Current Liability",
    label: "Other Current Liability",
    type: "LIABILITY",
    subType: "Other Current Liability",
    groupHeader: "Liability",
    description:
      "Short-term obligations — tax payable, accrued payroll, unearned revenue.",
  },
  {
    value: "LIABILITY:Non Current Liability",
    label: "Non Current Liability",
    type: "LIABILITY",
    subType: "Non Current Liability",
    groupHeader: "Liability",
    description:
      "Long-term obligations — mortgages, construction loans, term debt.",
  },
  {
    value: "LIABILITY:Other Liability",
    label: "Other Liability",
    type: "LIABILITY",
    subType: "Other Liability",
    groupHeader: "Liability",
    description:
      "Miscellaneous liabilities not covered by the other categories.",
  },

  // ───── Equity ─────
  {
    value: "EQUITY:Equity",
    label: "Equity",
    type: "EQUITY",
    subType: "Equity",
    groupHeader: "Equity",
    description:
      "Track owners' contributed capital, retained earnings, and distributions.",
  },

  // ───── Income ─────
  {
    value: "INCOME:Income",
    label: "Income",
    type: "INCOME",
    subType: "Income",
    groupHeader: "Income",
    description: "Track revenue from sales of goods and services.",
  },

  // ───── Expense ─────
  {
    value: "EXPENSE:Expense",
    label: "Expense",
    type: "EXPENSE",
    subType: "Expense",
    groupHeader: "Expense",
    description:
      "Track day-to-day operating expenses — rent, salaries, supplies.",
  },

  // ───── Cost of Goods Sold ─────
  {
    value: "COST_OF_GOODS_SOLD:Cost Of Goods Sold",
    label: "Cost of Goods Sold",
    type: "COST_OF_GOODS_SOLD",
    subType: "Cost Of Goods Sold",
    groupHeader: "Cost of Goods Sold",
    description:
      "Direct costs of producing the goods you sell — labor, materials, subcontract.",
  },

  // ───── Other Income / Other Expense ─────
  {
    value: "OTHER_INCOME:Other Income",
    label: "Other Income",
    type: "OTHER_INCOME",
    subType: "Other Income",
    groupHeader: "Other Income",
    description:
      "Non-operating income — interest earned, foreign-exchange gains, one-offs.",
  },
  {
    value: "OTHER_EXPENSE:Other Expense",
    label: "Other Expense",
    type: "OTHER_EXPENSE",
    subType: "Other Expense",
    groupHeader: "Other Expense",
    description:
      "Non-operating expenses — exchange losses, one-off charges.",
  },
];

/**
 * Parse the combined `TYPE:SUBTYPE` value the modal posts back.
 * Returns null on malformed input so the server action can reject
 * cleanly without throwing on a Z.parse boundary.
 */
export function parseAccountTypeValue(
  v: string
): { type: AccountType; subType: string } | null {
  const opt = ACCOUNT_TYPE_OPTIONS.find((o) => o.value === v);
  if (!opt) return null;
  return { type: opt.type, subType: opt.subType };
}
