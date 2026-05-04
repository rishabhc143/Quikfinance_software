"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1d4ed8"),
  logoUrl: z.string().url().optional().nullable(),
});

export async function saveBrandingAction(input: z.input<typeof schema>) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);

  await db.$transaction([
    db.organization.update({ where: { id: organization.id }, data: { logoUrl: data.logoUrl ?? null } }),
    db.organizationPreference.upsert({
      where: { organizationId: organization.id },
      update: { brandColor: data.brandColor },
      create: { organizationId: organization.id, brandColor: data.brandColor },
    }),
  ]);

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Branding",
    entityId: organization.id,
    after: data,
  });
  revalidatePath("/settings/branding");
  return { ok: true };
}
