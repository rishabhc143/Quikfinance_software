"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  updateSalesPreferenceSlice,
  type QuotePrefs,
} from "@/lib/sales/preferences";

export async function saveQuotesPrefsAction(input: QuotePrefs) {
  const { user, organization } = await requireOrganization();
  await updateSalesPreferenceSlice(organization.id, "quotes", input);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrganizationPreference",
    entityId: organization.id,
    after: { slice: "quotes" },
  });
  revalidatePath("/settings/preferences/quotes");
  return { ok: true };
}
