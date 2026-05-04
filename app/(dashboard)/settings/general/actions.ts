"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  decimalFormat: z.string().min(2),
  dateFormat: z.string().min(3),
  timeZone: z.string().min(2),
  language: z.string().min(2),
});

export async function saveGeneralAction(input: z.input<typeof schema>) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: data,
    create: { organizationId: organization.id, ...data },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "GeneralPreference",
    entityId: organization.id,
    after: data,
  });
  revalidatePath("/settings/general");
  return { ok: true };
}
