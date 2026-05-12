"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

/**
 * Server action for the "Notify me when available" flow on the
 * partner-bank stub page. Writes a UserPreference row keyed
 * `notify_bill_pay_bank_<slug>=true` so we can email the user when
 * that bank's integration actually lights up.
 *
 * Idempotent — re-opting in updates the same row's `updatedAt` so
 * we can sort by recency for the eventual broadcast.
 */
export async function notifyMeBillPayBankAction(input: {
  bankSlug: string;
  enabled: boolean;
}): Promise<{ ok: true; subscribed: boolean }> {
  const { user, organization } = await requireOrganization();
  if (!input.bankSlug?.trim()) {
    throw new Error("Bank slug required");
  }
  const key = `notify_bill_pay_bank_${input.bankSlug.toLowerCase()}`;
  await db.userPreference.upsert({
    where: {
      userId_organizationId_key: {
        userId: user.id,
        organizationId: organization.id,
        key,
      },
    },
    update: { value: input.enabled ? "true" : "false" },
    create: {
      userId: user.id,
      organizationId: organization.id,
      key,
      value: input.enabled ? "true" : "false",
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "UserPreference",
    entityId: key,
    after: { subscribed: input.enabled, bankSlug: input.bankSlug },
  });
  revalidatePath("/settings/integrations/bill-pay-banks");
  return { ok: true, subscribed: input.enabled };
}
