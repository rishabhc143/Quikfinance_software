"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const schema = z.object({
  date: z.coerce.date(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createManualJournalAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ date: formData.get("date"), notes: formData.get("notes") || null });
  const number = await nextDocumentNumber(organization.id, "manualJournal");
  const created = await db.manualJournal.create({
    data: { organizationId: organization.id, number, date: data.date, notes: data.notes ?? null },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "ManualJournal", entityId: created.id, after: { number } });
  revalidatePath("/accountant/manual-journals");
  redirect("/accountant/manual-journals");
}

export async function deleteManualJournalAction(id: string) {
  const { user, organization } = await requireOrganization();
  const j = await db.manualJournal.findFirst({ where: { id, organizationId: organization.id } });
  if (!j) return { ok: false };
  await db.manualJournal.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "ManualJournal", entityId: id, before: { number: j.number } });
  revalidatePath("/accountant/manual-journals");
  return { ok: true };
}
