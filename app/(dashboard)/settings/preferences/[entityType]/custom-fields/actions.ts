"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  CUSTOM_FIELD_DATA_TYPES,
  ENTITY_TYPE_URL,
} from "@/lib/sales/custom-fields";

/**
 * M17c: Custom Fields editor server actions. Generic — drive any
 * entityType (INVOICE / QUOTE / SALES_ORDER / CUSTOMER / …) by passing
 * the canonical slug. Routes are at
 * /settings/preferences/<urlSlug>/custom-fields.
 */

const optionShape = z.object({
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(60),
});

const upsertSchema = z.object({
  id: z.string().optional(),
  entityType: z.string().min(1).max(40),
  fieldKey: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "lowercase letters, digits, and underscores only"),
  label: z.string().min(1).max(80),
  dataType: z.enum(CUSTOM_FIELD_DATA_TYPES),
  options: z.array(optionShape).max(50).optional(),
  isRequired: z.boolean().default(false),
  showOnPdf: z.boolean().default(false),
  showOnPortal: z.boolean().default(false),
  position: z.coerce.number().int().min(0).default(0),
});

export type CustomFieldUpsertInput = z.input<typeof upsertSchema>;

function urlForEntityType(entityType: string): string {
  return ENTITY_TYPE_URL[entityType] ?? entityType.toLowerCase();
}

export async function upsertCustomFieldDefinitionAction(
  input: CustomFieldUpsertInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = upsertSchema.parse(input);

  // Dropdowns must declare options
  if (data.dataType === "dropdown" && (!data.options || data.options.length === 0)) {
    return { ok: false, error: "Dropdown fields require at least one option" };
  }

  if (data.id) {
    const before = await db.customFieldDefinition.findUnique({
      where: { id: data.id },
    });
    if (!before || before.organizationId !== organization.id) {
      return { ok: false, error: "Field not found" };
    }
    await db.customFieldDefinition.update({
      where: { id: data.id },
      data: {
        label: data.label,
        fieldKey: data.fieldKey,
        dataType: data.dataType,
        options:
          data.dataType === "dropdown" && data.options
            ? (data.options as object)
            : Prisma.JsonNull,
        isRequired: data.isRequired,
        showOnPdf: data.showOnPdf,
        showOnPortal: data.showOnPortal,
        position: data.position,
      },
    });
    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "UPDATE",
      entityType: "CustomFieldDefinition",
      entityId: data.id,
      before: { label: before.label, dataType: before.dataType },
      after: { label: data.label, dataType: data.dataType },
    });
    revalidatePath(
      `/settings/preferences/${urlForEntityType(data.entityType)}/custom-fields`
    );
    return { ok: true, id: data.id };
  }

  // Create — guard against duplicate fieldKey within the same org+entityType
  const dup = await db.customFieldDefinition.findFirst({
    where: {
      organizationId: organization.id,
      entityType: data.entityType,
      fieldKey: data.fieldKey,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (dup) {
    return {
      ok: false,
      error: `A custom field with key "${data.fieldKey}" already exists`,
    };
  }

  const created = await db.customFieldDefinition.create({
    data: {
      organizationId: organization.id,
      entityType: data.entityType,
      fieldKey: data.fieldKey,
      label: data.label,
      dataType: data.dataType,
      options: data.dataType === "dropdown" ? data.options : undefined,
      isRequired: data.isRequired,
      showOnPdf: data.showOnPdf,
      showOnPortal: data.showOnPortal,
      position: data.position,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "CustomFieldDefinition",
    entityId: created.id,
    after: {
      entityType: data.entityType,
      fieldKey: data.fieldKey,
      label: data.label,
      dataType: data.dataType,
    },
  });
  revalidatePath(
    `/settings/preferences/${urlForEntityType(data.entityType)}/custom-fields`
  );
  return { ok: true, id: created.id };
}

export async function deleteCustomFieldDefinitionAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const before = await db.customFieldDefinition.findUnique({
    where: { id: input.id },
  });
  if (!before || before.organizationId !== organization.id) {
    return { ok: false, error: "Field not found" };
  }
  // Soft delete — preserves existing CustomFieldValue rows for audit
  // and so a re-create can recover the same key without conflict.
  await db.customFieldDefinition.update({
    where: { id: input.id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "CustomFieldDefinition",
    entityId: input.id,
    before: { label: before.label, fieldKey: before.fieldKey },
  });
  revalidatePath(
    `/settings/preferences/${urlForEntityType(before.entityType)}/custom-fields`
  );
  return { ok: true };
}

/**
 * Persist a set of values for a given (entityType, entityId). Called
 * from each form's save action. Replaces existing values wholesale —
 * simpler than diffing, and the `@@unique([entityType, entityId,
 * fieldDefinitionId])` constraint enforces single-row-per-field.
 */
export async function setCustomFieldValuesAction(input: {
  entityType: string;
  entityId: string;
  values: { fieldDefinitionId: string; value: unknown }[];
}): Promise<{ ok: boolean; error?: string }> {
  const { organization } = await requireOrganization();

  await db.$transaction(async (tx) => {
    await tx.customFieldValue.deleteMany({
      where: {
        organizationId: organization.id,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
    if (input.values.length > 0) {
      await tx.customFieldValue.createMany({
        data: input.values.map((v) => ({
          organizationId: organization.id,
          entityType: input.entityType,
          entityId: input.entityId,
          fieldDefinitionId: v.fieldDefinitionId,
          value: v.value as object,
        })),
      });
    }
  });

  return { ok: true };
}
