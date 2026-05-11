"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  country: z.string().min(2),
  currency: z.string().min(3),
  fiscalYearStart: z.coerce.number().int().min(1).max(12),
  // GSTIN is optional and stored as-is. Format validation is a soft
  // warning on the client; users in countries other than India can
  // leave it blank.
  gstin: z
    .string()
    .trim()
    .max(15)
    .transform((v) => (v.length === 0 ? null : v.toUpperCase()))
    .nullable()
    .optional(),
  logoUrl: z.string().url().optional().nullable(),
});

export async function saveProfileAction(input: z.input<typeof schema>) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);

  if (data.slug !== organization.slug) {
    const exists = await db.organization.findFirst({ where: { slug: data.slug, NOT: { id: organization.id } } });
    if (exists) throw new Error("That slug is taken. Try another.");
  }

  const before = { name: organization.name, slug: organization.slug, currency: organization.currency };
  await db.organization.update({
    where: { id: organization.id },
    data: { ...data, logoUrl: data.logoUrl ?? null, gstin: data.gstin ?? null },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Organization",
    entityId: organization.id,
    before,
    after: { name: data.name, slug: data.slug, currency: data.currency },
  });

  revalidatePath("/settings/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}
