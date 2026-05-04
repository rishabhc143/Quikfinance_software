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

export async function deleteVendorCreditAction(id: string) {
  const { user, organization } = await requireOrganization();
  const vc = await db.vendorCredit.findFirst({ where: { id, organizationId: organization.id } });
  if (!vc) return { ok: false };
  await db.vendorCredit.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "VendorCredit", entityId: id, before: { number: vc.number } });
  revalidatePath("/purchases/vendor-credits");
  return { ok: true };
}
