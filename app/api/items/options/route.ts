import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export async function GET() {
  const { organization } = await requireOrganization();

  const [salesAccounts, purchaseAccounts, vendors, prefs] = await Promise.all([
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true, type: { in: ["INCOME", "OTHER_INCOME"] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true, type: { in: ["EXPENSE", "COST_OF_GOODS_SOLD", "OTHER_EXPENSE"] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.contact.findMany({
      where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    }),
    db.organizationPreference.findUnique({ where: { organizationId: organization.id } }),
  ]);

  return NextResponse.json({
    salesAccounts: salesAccounts.map((a) => ({ value: a.id, label: a.name, hint: a.code ?? undefined })),
    purchaseAccounts: purchaseAccounts.map((a) => ({ value: a.id, label: a.name, hint: a.code ?? undefined })),
    vendors: vendors.map((v) => ({ value: v.id, label: v.displayName, hint: v.email ?? undefined })),
    inventoryEnabled: prefs?.inventoryEnabled ?? false,
    currency: organization.currency,
  });
}
