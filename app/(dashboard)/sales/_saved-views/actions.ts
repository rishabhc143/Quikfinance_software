"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

/**
 * M31: SavedView CRUD server actions.
 *
 * The data model has been in place since M17a; M17d shipped lazy
 * seeding of system views. This batch adds user-scoped custom views
 * via a "+ New Custom View" modal — the user filters the list, opens
 * the modal, gives it a name, and the current URL filters are
 * captured into a SavedView row tied to their userId.
 *
 * filterJson shape (mirrors lib/sales/saved-views.ts):
 *   { kind: "all" }
 *   { kind: "status", value: <single | string[]> }
 *   { kind: "boolean", field: string, value: boolean }
 *
 * v1 only stores `kind: "status"` (the most common filter — Invoice's
 * "All Drafts I Sent in Q3" pattern). Date-range / customer-multi-
 * select / amount-range filters land in a follow-up.
 */

const createSchema = z.object({
  module: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  // Capture the current URL state — the dialog passes whatever
  // searchParams the user has on the list page (q, view, etc.)
  filterJson: z.unknown(),
});

export async function createSavedViewAction(input: {
  module: string;
  name: string;
  filterJson: unknown;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createSchema.parse(input);

  // Block duplicate names for this user+org+module
  const existing = await db.savedView.findFirst({
    where: {
      organizationId: organization.id,
      module: data.module,
      userId: user.id,
      name: data.name,
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: `A view named "${data.name}" already exists` };
  }

  const created = await db.savedView.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      module: data.module,
      name: data.name,
      isSystem: false,
      isDefault: false,
      position: 100, // user views sort after system views
      filterJson: (data.filterJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "SavedView",
    entityId: created.id,
    after: { module: data.module, name: data.name },
  });

  revalidatePath(`/sales/${moduleToUrlSlug(data.module)}`);
  return { ok: true, id: created.id };
}

export async function deleteSavedViewAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const view = await db.savedView.findUnique({ where: { id: input.id } });
  if (!view || view.organizationId !== organization.id) {
    return { ok: false, error: "View not found" };
  }
  if (view.isSystem) {
    return { ok: false, error: "System views cannot be deleted" };
  }
  if (view.userId && view.userId !== user.id) {
    return { ok: false, error: "Cannot delete another user's view" };
  }
  await db.savedView.delete({ where: { id: input.id } });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "SavedView",
    entityId: input.id,
    before: { module: view.module, name: view.name },
  });
  revalidatePath(`/sales/${moduleToUrlSlug(view.module)}`);
  return { ok: true };
}

/**
 * v1 module slug → URL path mapping. Mirrors the values used by
 * lib/sales/saved-views.ts SavedViewModule type.
 */
function moduleToUrlSlug(module: string): string {
  switch (module) {
    case "invoices":
      return "invoices";
    case "quotes":
      return "quotes";
    case "sales_orders":
      return "orders";
    case "delivery_challans":
      return "delivery-challans";
    case "credit_notes":
      return "credit-notes";
    case "payments_received":
      return "payments-received";
    case "recurring_invoices":
      return "recurring-invoices";
    case "customers":
      return "customers";
    default:
      return module;
  }
}
