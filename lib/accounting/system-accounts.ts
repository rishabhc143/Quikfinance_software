import "server-only";
import { db } from "@/lib/db";
import type { AccountType, ChartOfAccount, Prisma } from "@prisma/client";

/**
 * RPT-B — System Chart-of-Accounts entries used by the domain → ledger
 * posting code. Each kind has a deterministic code prefix per org;
 * the helper lazy-creates the CoA row the first time it's needed and
 * returns the cached row thereafter.
 *
 *   AR             → SYS-AR     (ASSET)        Accounts Receivable
 *   AP             → SYS-AP     (LIABILITY)    Accounts Payable
 *   SALES_REVENUE  → SYS-REV    (INCOME)       Sales Revenue (default income)
 *   BILL_EXPENSE   → SYS-EXP    (EXPENSE)      Bill Expense (default expense)
 *
 * Users can rename these in the Chart-of-Accounts UI but the `code`
 * stays as the deterministic lookup key. Race-safe: a concurrent
 * first-call from another worker just hits the unique-violation on
 * `(organizationId, code)` and we re-read.
 */

export type SystemAccountKind =
  | "AR"
  | "AP"
  | "SALES_REVENUE"
  | "BILL_EXPENSE"
  | "CASH_ON_HAND"
  | "SALES_RETURNS"
  | "PURCHASE_RETURNS"
  | "BAD_DEBT_EXPENSE"
  | "BAD_DEBT_RECOVERY";

type Spec = {
  code: string;
  name: string;
  type: AccountType;
  description: string;
};

const SPEC: Record<SystemAccountKind, Spec> = {
  AR: {
    code: "SYS-AR",
    name: "Accounts Receivable",
    type: "ASSET",
    description:
      "System account: amounts owed by customers (DR side of invoice posting).",
  },
  AP: {
    code: "SYS-AP",
    name: "Accounts Payable",
    type: "LIABILITY",
    description:
      "System account: amounts owed to vendors (CR side of bill posting).",
  },
  SALES_REVENUE: {
    code: "SYS-REV",
    name: "Sales Revenue",
    type: "INCOME",
    description:
      "System account: default income account for invoices (CR side).",
  },
  BILL_EXPENSE: {
    code: "SYS-EXP",
    name: "Bill Expense",
    type: "EXPENSE",
    description:
      "System account: default expense account for bills (DR side).",
  },
  CASH_ON_HAND: {
    code: "SYS-CASH",
    name: "Cash on Hand",
    type: "ASSET",
    description:
      "System account: fallback bank-side leg for payments when no bank or deposit-to account is configured.",
  },
  // RPT-B Phase 2 — credit notes + write-offs.
  SALES_RETURNS: {
    code: "SYS-SR",
    name: "Sales Returns",
    type: "EXPENSE",
    description:
      "System account: contra-revenue posting for sales credit notes (DR side of CN creation).",
  },
  PURCHASE_RETURNS: {
    code: "SYS-PR",
    name: "Purchase Returns",
    type: "OTHER_INCOME",
    description:
      "System account: contra-expense posting for vendor credits (CR side of VC creation).",
  },
  BAD_DEBT_EXPENSE: {
    code: "SYS-BAD",
    name: "Bad Debt Expense",
    type: "EXPENSE",
    description:
      "System account: posted when an unpaid invoice is written off (DR side; CR is AR).",
  },
  BAD_DEBT_RECOVERY: {
    code: "SYS-RECOV",
    name: "Bad Debt Recovery",
    type: "OTHER_INCOME",
    description:
      "System account: posted when an unpaid bill is written off (CR side; DR is AP).",
  },
};

type Client = typeof db | Prisma.TransactionClient;

/**
 * Look up the system account by org + code, or create it. The
 * `(organizationId, code)` pair is unique in the schema, so two
 * concurrent first-calls reconcile on the unique violation.
 *
 * Pass the optional `tx` arg to keep the read+create inside an
 * existing transaction.
 */
export async function getOrCreateSystemAccount(
  organizationId: string,
  kind: SystemAccountKind,
  client: Client = db
): Promise<ChartOfAccount> {
  const spec = SPEC[kind];

  const existing = await client.chartOfAccount.findFirst({
    where: { organizationId, code: spec.code },
  });
  if (existing) return existing;

  try {
    return await client.chartOfAccount.create({
      data: {
        organizationId,
        code: spec.code,
        name: spec.name,
        type: spec.type,
        description: spec.description,
        isActive: true,
      },
    });
  } catch {
    // Lost the race to another worker — re-read and return that one.
    const reread = await client.chartOfAccount.findFirst({
      where: { organizationId, code: spec.code },
    });
    if (reread) return reread;
    throw new Error(
      `getOrCreateSystemAccount: could not create or find ${spec.code} for org ${organizationId}`
    );
  }
}
