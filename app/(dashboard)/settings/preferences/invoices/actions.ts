"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  updateSalesPreferenceSlice,
  type InvoicePrefs,
} from "@/lib/sales/preferences";

export async function saveInvoicesPrefsAction(input: InvoicePrefs) {
  const { user, organization } = await requireOrganization();
  await updateSalesPreferenceSlice(organization.id, "invoices", input);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrganizationPreference",
    entityId: organization.id,
    after: { slice: "invoices" },
  });
  revalidatePath("/settings/preferences/invoices");
  return { ok: true };
}
