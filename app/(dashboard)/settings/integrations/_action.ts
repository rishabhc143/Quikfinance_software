"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function setIntegrationConnectedAction(kind: string, isConnected: boolean) {
  const { user, organization } = await requireOrganization();
  await db.integration.upsert({
    where: { organizationId_kind: { organizationId: organization.id, kind } },
    update: { isConnected, connectedAt: isConnected ? new Date() : null },
    create: { organizationId: organization.id, kind, isConnected, connectedAt: isConnected ? new Date() : null },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Integration", entityId: kind, after: { kind, isConnected } });
  revalidatePath("/settings/integrations/" + kind.replace("_", "-"));
}
