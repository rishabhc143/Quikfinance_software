"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function setInventoryEnabledAction(enabled: boolean) {
  const { user, organization } = await requireOrganization();
  await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: { inventoryEnabled: enabled },
    create: { organizationId: organization.id, inventoryEnabled: enabled },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrganizationPreference",
    entityId: organization.id,
    after: { inventoryEnabled: enabled },
  });
  revalidatePath("/settings/preferences/items");
  revalidatePath("/items/new");
  return { ok: true };
}
