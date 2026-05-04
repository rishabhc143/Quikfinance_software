"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  url: z.string().url(),
  event: z.string().min(1).max(40),
});

export async function createWebhookAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ url: formData.get("url"), event: formData.get("event") });
  const created = await db.webhook.create({
    data: { organizationId: organization.id, ...data, secret: crypto.randomBytes(24).toString("hex") },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Webhook", entityId: created.id, after: data });
  revalidatePath("/settings/developer/webhooks");
}

export async function deleteWebhookAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.webhook.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Webhook", entityId: id });
  revalidatePath("/settings/developer/webhooks");
}
