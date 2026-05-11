"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const schema = z.object({
  contactId: z.string().min(1),
  date: z.coerce.date(),
  total: z.coerce.number().nonnegative(),
});
export type VendorCreditInput = z.input<typeof schema>;

export async function createVendorCreditAction(input: VendorCreditInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "vendorCredit");
  const created = await db.vendorCredit.create({
    data: { organizationId: organization.id, number, contactId: data.contactId, date: data.date, total: data.total },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "VendorCredit", entityId: created.id, after: { number, total: data.total } });
  revalidatePath("/purchases/vendor-credits");
  redirect("/purchases/vendor-credits");
}

/**
 * Bulk soft-delete vendor credits. Blocks any credit that has been
 * partially applied or refunded — applying it again is fine, but
 * deletion would orphan VendorCreditApplication / VendorCreditRefund
 * rows.
 */
export async function bulkDeleteVendorCreditsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };

  const blocked = await db.vendorCredit.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      OR: [
        { amountApplied: { gt: 0 } },
        { amountRefunded: { gt: 0 } },
      ],
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} credit${
        blocked === 1 ? "" : "s"
      } already applied or refunded. Reverse those first.`,
    };
  }

  const result = await db.vendorCredit.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "VendorCredit",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/vendor-credits");
  return { ok: true, updated: result.count };
}

export async function deleteVendorCreditAction(id: string) {
  const { user, organization } = await requireOrganization();
  const vc = await db.vendorCredit.findFirst({ where: { id, organizationId: organization.id } });
  if (!vc) return { ok: false };
  await db.vendorCredit.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "VendorCredit", entityId: id, before: { number: vc.number } });
  revalidatePath("/purchases/vendor-credits");
  return { ok: true };
}
