"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

const allowed = [
  "customDomain", "msmeRegistered", "msmeNumber",
  "tdsEnabled", "tanNumber", "panNumber",
  "customerPortalEnabled", "vendorPortalEnabled",
  "aiSystemPromptOverride", "aiRateLimitPerDay",
  "pdfTemplate", "smsEnabled", "digitalSignatureEnabled",
  "themeDefault", "densityDefault", "language", "timeZone",
] as const;

type AllowedKey = (typeof allowed)[number];

export async function updatePreferenceAction(input: { key: AllowedKey; value: string | boolean | number | null }) {
  const { user, organization } = await requireOrganization();
  if (!allowed.includes(input.key)) throw new Error("Invalid preference key");
  const data: Prisma.OrganizationPreferenceUpdateInput = { [input.key]: input.value } as Prisma.OrganizationPreferenceUpdateInput;
  await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: data,
    create: { organizationId: organization.id, ...data } as Prisma.OrganizationPreferenceUncheckedCreateInput,
  });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "UPDATE", entityType: "OrganizationPreference", entityId: organization.id,
    after: { [input.key]: input.value },
  });
  revalidatePath("/settings");
  return { ok: true };
}

const BulkSchema = z.record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.null()]));

export async function updatePreferencesBulkAction(input: Record<string, string | boolean | number | null>) {
  const { user, organization } = await requireOrganization();
  const parsed = BulkSchema.parse(input);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (allowed.includes(k as AllowedKey)) data[k] = v;
  }
  if (Object.keys(data).length === 0) return { ok: true, skipped: true };
  await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: data as Prisma.OrganizationPreferenceUpdateInput,
    create: { organizationId: organization.id, ...data } as Prisma.OrganizationPreferenceUncheckedCreateInput,
  });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "UPDATE", entityType: "OrganizationPreference", entityId: organization.id,
    after: data,
  });
  revalidatePath("/settings");
  return { ok: true };
}
