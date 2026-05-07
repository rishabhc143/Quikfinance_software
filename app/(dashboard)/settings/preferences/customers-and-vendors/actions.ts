"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  updateSalesPreferenceSlice,
  type CustomerPrefs,
} from "@/lib/sales/preferences";

export async function saveCustomerPrefsAction(input: CustomerPrefs) {
  const { user, organization } = await requireOrganization();
  await updateSalesPreferenceSlice(organization.id, "customers", input);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrganizationPreference",
    entityId: organization.id,
    after: { slice: "customers" },
  });
  revalidatePath("/settings/preferences/customers-and-vendors");
  return { ok: true };
}
