"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  emailOnInvoiceSent: z.boolean(),
  emailOnInvoicePaid: z.boolean(),
  emailOnBillDue: z.boolean(),
  emailOnPaymentReceived: z.boolean(),
  emailOnEstimateAccepted: z.boolean(),
  emailDigestWeekly: z.boolean(),
});

export async function saveEmailPrefsAction(input: z.input<typeof schema>) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: data,
    create: { organizationId: organization.id, ...data },
  });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "UPDATE", entityType: "EmailPreference", entityId: organization.id,
    after: data,
  });
  revalidatePath("/settings/email-notifications");
  return { ok: true };
}
