"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  updateSalesPreferenceSlice,
  type SalesOrderPrefs,
} from "@/lib/sales/preferences";

export async function saveSalesOrdersPrefsAction(input: SalesOrderPrefs) {
  const { user, organization } = await requireOrganization();
  await updateSalesPreferenceSlice(organization.id, "salesOrders", input);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrganizationPreference",
    entityId: organization.id,
    after: { slice: "salesOrders" },
  });
  revalidatePath("/settings/preferences/sales-orders");
  return { ok: true };
}
