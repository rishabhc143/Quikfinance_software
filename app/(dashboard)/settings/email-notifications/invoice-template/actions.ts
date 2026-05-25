"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const inputSchema = z.object({
  subject: z.string().max(500).nullable(),
  body: z.string().max(20_000).nullable(),
});

/**
 * Save the org's default invoice email template. Both fields are
 * nullable — setting either to null reverts to the hard-coded default
 * in SendInvoiceDialog.
 *
 * Upserts the OrganizationPreference row so first-time saves work
 * even if the org has no preference row yet.
 */
export async function saveInvoiceEmailTemplateAction(input: {
  subject: string | null;
  body: string | null;
}): Promise<void> {
  const { organization, user } = await requireOrganization();
  const parsed = inputSchema.parse(input);

  // Normalise empty strings to null so the dialog's fallback kicks in.
  const subject = parsed.subject?.trim() || null;
  const body = parsed.body?.trim() || null;

  await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: { invoiceEmailSubject: subject, invoiceEmailBody: body },
    create: {
      organizationId: organization.id,
      invoiceEmailSubject: subject,
      invoiceEmailBody: body,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrganizationPreference",
    entityId: organization.id,
    after: { invoiceEmailSubject: subject, invoiceEmailBody: body },
  });

  revalidatePath("/settings/email-notifications/invoice-template");
}
