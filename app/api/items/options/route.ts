import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

/**
 * Humanize a Prisma AccountType enum value into the label shown in the
 * grouped Combobox dropdown when an account has no `subType`. Falls back
 * to the broad type label so older accounts pre-ACCT-E still render
 * under a sensible group heading.
 */
const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

function accountGroup(row: {
  type: string;
  subType: string | null;
}): string {
  return row.subType?.trim() || TYPE_LABELS[row.type] || row.type;
}

export async function GET() {
  const { organization } = await requireOrganization();

  const [salesAccounts, purchaseAccounts, inventoryAccounts, vendors, prefs] = await Promise.all([
    // Per Zoho-parity user ask (PR #334): the Account dropdown in the
    // item form now shows ALL active accounts grouped by subType
    // (Income / Other Current Liability / Fixed Asset / etc.), not
    // just Income types. Same for Purchase Account.
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true, type: true, subType: true },
      orderBy: [{ subType: "asc" }, { name: "asc" }],
    }),
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true, type: true, subType: true },
      orderBy: [{ subType: "asc" }, { name: "asc" }],
    }),
    // PR #335: Inventory Account dropdown was previously rendered with
    // `options={[]}` (a hardcoded empty array — literally unselectable
    // by the user). Filtered to ASSET type because inventory value
    // semantically belongs on the asset side of the ledger (typically
    // "Stock on Hand" under Other Current Asset). Grouped by subType
    // for consistency with the Sales/Purchase dropdowns.
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true, type: "ASSET" },
      select: { id: true, name: true, code: true, type: true, subType: true },
      orderBy: [{ subType: "asc" }, { name: "asc" }],
    }),
    db.contact.findMany({
      where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    }),
    db.organizationPreference.findUnique({ where: { organizationId: organization.id } }),
  ]);

  return NextResponse.json({
    salesAccounts: salesAccounts.map((a) => ({
      value: a.id,
      label: a.name,
      hint: a.code ?? undefined,
      group: accountGroup(a),
    })),
    purchaseAccounts: purchaseAccounts.map((a) => ({
      value: a.id,
      label: a.name,
      hint: a.code ?? undefined,
      group: accountGroup(a),
    })),
    inventoryAccounts: inventoryAccounts.map((a) => ({
      value: a.id,
      label: a.name,
      hint: a.code ?? undefined,
      group: accountGroup(a),
    })),
    vendors: vendors.map((v) => ({ value: v.id, label: v.displayName, hint: v.email ?? undefined })),
    inventoryEnabled: prefs?.inventoryEnabled ?? false,
    currency: organization.currency,
  });
}
