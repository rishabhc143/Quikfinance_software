"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const lineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.coerce.number().nonnegative().default(0),
  credit: z.coerce.number().nonnegative().default(0),
  description: z.string().max(500).optional().nullable(),
});

const schema = z.object({
  date: z.coerce.date(),
  reference: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(2),
});

export type JournalEntryInput = z.input<typeof schema>;

export async function createJournalEntryAction(input: JournalEntryInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);

  const totalDebit = data.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = data.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) throw new Error(`Debits (${totalDebit.toFixed(2)}) must equal credits (${totalCredit.toFixed(2)})`);
  if (totalDebit === 0) throw new Error("Journal entry total cannot be zero");

  // Verify account ownership
  const accounts = await db.chartOfAccount.findMany({
    where: { id: { in: data.lines.map((l) => l.accountId) }, organizationId: organization.id },
    select: { id: true },
  });
  if (accounts.length !== new Set(data.lines.map((l) => l.accountId)).size) {
    throw new Error("Some accounts not found");
  }

  const created = await db.journalEntry.create({
    data: {
      organizationId: organization.id,
      date: data.date, reference: data.reference ?? null, notes: data.notes ?? null,
      lines: { create: data.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description ?? null })) },
    },
  });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "CREATE", entityType: "JournalEntry", entityId: created.id,
    after: { totalDebit, totalCredit, lines: data.lines.length },
  });
  revalidatePath("/accountant/journal-entries");
  redirect(`/accountant/journal-entries`);
}

export async function deleteJournalEntryAction(id: string) {
  const { user, organization } = await requireOrganization();
  const j = await db.journalEntry.findFirst({ where: { id, organizationId: organization.id } });
  if (!j) return { ok: false };
  await db.journalEntry.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "JournalEntry", entityId: id });
  revalidatePath("/accountant/journal-entries");
  return { ok: true };
}
