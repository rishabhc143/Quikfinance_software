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
export type CreditNoteInput = z.input<typeof schema>;

export async function createCreditNoteAction(input: CreditNoteInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "creditNote");
  const created = await db.creditNote.create({
    data: { organizationId: organization.id, number, contactId: data.contactId, date: data.date, total: data.total },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "CreditNote", entityId: created.id, after: { number, total: data.total } });
  revalidatePath("/sales/credit-notes");
  redirect("/sales/credit-notes");
}

export async function deleteCreditNoteAction(id: string) {
  const { user, organization } = await requireOrganization();
  const cn = await db.creditNote.findFirst({ where: { id, organizationId: organization.id } });
  if (!cn) return { ok: false };
  await db.creditNote.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "CreditNote", entityId: id, before: { number: cn.number } });
  revalidatePath("/sales/credit-notes");
  return { ok: true };
}
