"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  coerceBulkUpdateValue,
  findField,
  modelForCategory,
  type BulkUpdateCategory,
} from "@/lib/accountant/bulk-update";

/**
 * ACCT-B — Bulk Update server actions.
 *
 *   listRowsForBulkUpdateAction — paginated, searchable row list per
 *     category. The wizard's "select rows" step calls this.
 *
 *   applyBulkUpdateAction       — applies the chosen field's new
 *     value to the user-selected ids. Whitelist-checked, type-coerced,
 *     org-scoped.
 *
 * Both actions reject any (category, field) pair not in the
 * `lib/accountant/bulk-update.ts` whitelist — single source of truth.
 */

const CATEGORY = z.enum(["ITEMS", "CUSTOMERS", "VENDORS"]);

const listSchema = z.object({
  category: CATEGORY,
  search: z.string().max(120).optional().nullable(),
  filter: z.enum(["active", "inactive", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type BulkUpdateRow = {
  id: string;
  name: string;
  /** Free-form supporting metadata to render in the row */
  subtitle: string | null;
  active: boolean;
};

export type BulkUpdateListResult = {
  rows: BulkUpdateRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listRowsForBulkUpdateAction(input: {
  category: BulkUpdateCategory;
  search?: string | null;
  filter?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
}): Promise<BulkUpdateListResult> {
  const { organization } = await requireOrganization();
  const data = listSchema.parse(input);
  const model = modelForCategory(data.category);

  // Build the active/inactive predicate. Items use `isActive` (true =
  // active); Contacts use `isInactive` (true = inactive — inverted).
  const activeWhere =
    data.filter === "all"
      ? {}
      : model.activeField === "isActive"
        ? { isActive: data.filter === "active" }
        : { isInactive: data.filter !== "active" };

  const search = (data.search ?? "").trim();
  const searchWhere =
    search.length === 0
      ? {}
      : model.table === "item"
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {
            OR: [
              { displayName: { contains: search, mode: "insensitive" as const } },
              { companyName: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          };

  const where = {
    organizationId: organization.id,
    ...model.scopeWhere,
    ...activeWhere,
    ...searchWhere,
  };

  if (model.table === "item") {
    const [total, items] = await Promise.all([
      db.item.count({ where: where as Prisma.ItemWhereInput }),
      db.item.findMany({
        where: where as Prisma.ItemWhereInput,
        orderBy: { name: "asc" },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          isActive: true,
        },
      }),
    ]);
    return {
      rows: items.map((it) => ({
        id: it.id,
        name: it.name,
        subtitle:
          (it.sku ? `SKU ${it.sku}` : null) ??
          (it.sellingPrice != null
            ? `Selling ₹${Number(it.sellingPrice).toFixed(2)}`
            : null),
        active: it.isActive,
      })),
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  }

  // Contact (CUSTOMERS / VENDORS)
  const [total, contacts] = await Promise.all([
    db.contact.count({ where: where as Prisma.ContactWhereInput }),
    db.contact.findMany({
      where: where as Prisma.ContactWhereInput,
      orderBy: { displayName: "asc" },
      skip: (data.page - 1) * data.pageSize,
      take: data.pageSize,
      select: {
        id: true,
        displayName: true,
        companyName: true,
        email: true,
        isInactive: true,
      },
    }),
  ]);
  return {
    rows: contacts.map((c) => ({
      id: c.id,
      name: c.displayName,
      subtitle: c.companyName ?? c.email ?? null,
      active: !c.isInactive,
    })),
    total,
    page: data.page,
    pageSize: data.pageSize,
  };
}

const applySchema = z.object({
  category: CATEGORY,
  fieldKey: z.string().min(1),
  // `rawValue` accepts whatever the wizard sends — coerceBulkUpdateValue
  // does the type validation against the whitelisted field config.
  rawValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ids: z.array(z.string().min(1)).min(1, "Select at least one row."),
});

export type ApplyBulkUpdateResult = {
  ok: boolean;
  updated?: number;
  error?: string;
};

export async function applyBulkUpdateAction(input: {
  category: BulkUpdateCategory;
  fieldKey: string;
  rawValue: string | number | boolean | null;
  ids: string[];
}): Promise<ApplyBulkUpdateResult> {
  const { user, organization } = await requireOrganization();
  const data = applySchema.parse(input);

  const field = findField(data.category, data.fieldKey);
  if (!field) {
    return {
      ok: false,
      error: `Field "${data.fieldKey}" isn't bulk-updatable on ${data.category.toLowerCase()}.`,
    };
  }

  const coerced = coerceBulkUpdateValue(data.category, data.fieldKey, data.rawValue);
  if ("error" in coerced) return { ok: false, error: coerced.error };

  // For select fields, verify the option belongs to this org.
  if (field.inputType === "select" && coerced.value !== null) {
    const optionId = String(coerced.value);
    if (field.optionsKey === "TAXES") {
      const ok = await db.tax.findFirst({
        where: { id: optionId, organizationId: organization.id },
        select: { id: true },
      });
      if (!ok) return { ok: false, error: "Tax not found in this organization." };
    } else if (field.optionsKey === "PAYMENT_TERMS") {
      const ok = await db.paymentTerms.findFirst({
        where: { id: optionId, organizationId: organization.id },
        select: { id: true },
      });
      if (!ok) {
        return {
          ok: false,
          error: "Payment terms option not found in this organization.",
        };
      }
    }
  }

  const model = modelForCategory(data.category);

  // Apply. Cross-tenant safety: every update path filters ids through
  // organizationId + the category's scopeWhere.
  let result: { count: number };
  if (model.table === "item") {
    const updateData: Prisma.ItemUpdateManyMutationInput = {
      [data.fieldKey]: coerced.value,
    } as Prisma.ItemUpdateManyMutationInput;
    result = await db.item.updateMany({
      where: {
        id: { in: data.ids },
        organizationId: organization.id,
        ...(model.scopeWhere as Prisma.ItemWhereInput),
      },
      data: updateData,
    });
  } else {
    const updateData: Prisma.ContactUpdateManyMutationInput = {
      [data.fieldKey]: coerced.value,
    } as Prisma.ContactUpdateManyMutationInput;
    result = await db.contact.updateMany({
      where: {
        id: { in: data.ids },
        organizationId: organization.id,
        ...(model.scopeWhere as Prisma.ContactWhereInput),
      },
      data: updateData,
    });
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "BulkUpdate",
    // Synthetic id — there's no single record this update mutates.
    entityId: `${data.category}:${data.fieldKey}`,
    after: {
      category: data.category,
      field: data.fieldKey,
      newValue: coerced.value,
      count: result.count,
      sampleIds: data.ids.slice(0, 5),
    },
  });

  // Revalidate the affected lists.
  if (data.category === "ITEMS") revalidatePath("/items");
  else revalidatePath("/sales/customers");
  if (data.category === "VENDORS") revalidatePath("/purchases/vendors");

  return { ok: true, updated: result.count };
}
