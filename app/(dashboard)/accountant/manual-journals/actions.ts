"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";
import { validateManualJournalLines } from "@/lib/accounting/manual-journal-validation";

/**
 * ACCT-A — Manual Journals as real double-entry postings.
 *
 * One ManualJournal header maps to exactly one JournalEntry with the
 * structured reference `MJ:<manualJournalId>` (parseable by
 * lib/accounting/parse-je-reference.ts). Create + delete are atomic:
 * both rows land or neither does.
 */

const lineSchema = z.object({
  accountId: z.string().min(1, "Pick an account for every line."),
  debit: z.coerce.number().nonnegative().default(0),
  credit: z.coerce.number().nonnegative().default(0),
  description: z.string().max(500).optional().nullable(),
});

const createSchema = z.object({
  date: z.coerce.date(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(2, "Need at least two lines."),
});

export type ManualJournalInput = z.input<typeof createSchema>;

export async function createManualJournalAction(
  input: ManualJournalInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createSchema.parse(input);

  const err = validateManualJournalLines(data.lines);
  if (err) return { ok: false, error: err };

  // Verify CoA ownership (same pattern as createJournalEntryAction).
  const accounts = await db.chartOfAccount.findMany({
    where: {
      id: { in: data.lines.map((l) => l.accountId) },
      organizationId: organization.id,
    },
    select: { id: true },
  });
  if (accounts.length !== new Set(data.lines.map((l) => l.accountId)).size) {
    return { ok: false, error: "Some accounts not found in this org." };
  }

  const number = await nextDocumentNumber(organization.id, "manualJournal");

  const created = await db.$transaction(async (tx) => {
    const header = await tx.manualJournal.create({
      data: {
        organizationId: organization.id,
        number,
        date: data.date,
        notes: data.notes ?? null,
      },
    });
    await tx.journalEntry.create({
      data: {
        organizationId: organization.id,
        date: data.date,
        reference: `MJ:${header.id}`,
        notes: data.notes ?? `Manual journal ${number}`,
        lines: {
          create: data.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description ?? null,
          })),
        },
      },
    });
    return header;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "ManualJournal",
    entityId: created.id,
    after: {
      number,
      totalDebit: data.lines.reduce((s, l) => s + l.debit, 0),
      lines: data.lines.length,
    },
  });

  revalidatePath("/accountant/manual-journals");
  revalidatePath("/accountant/journal-entries");
  return { ok: true, id: created.id };
}

/**
 * Bind-friendly wrapper — the form calls this so the redirect lands
 * on the new detail page instead of bouncing back via a tuple.
 */
export async function createManualJournalAndRedirectAction(
  input: ManualJournalInput
): Promise<void> {
  const res = await createManualJournalAction(input);
  if (!res.ok || !res.id) {
    throw new Error(res.error ?? "Failed to create manual journal");
  }
  redirect(`/accountant/manual-journals/${res.id}`);
}

/**
 * Delete the manual-journal header AND its linked JE in one tx.
 * Reuses the structured reference key so the lookup is deterministic.
 */
export async function deleteManualJournalAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const j = await db.manualJournal.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!j) return { ok: false, error: "Manual journal not found" };

  await db.$transaction([
    db.journalEntry.deleteMany({
      where: { organizationId: organization.id, reference: `MJ:${id}` },
    }),
    db.manualJournal.delete({ where: { id } }),
  ]);

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "ManualJournal",
    entityId: id,
    before: { number: j.number },
  });

  revalidatePath("/accountant/manual-journals");
  revalidatePath("/accountant/journal-entries");
  return { ok: true };
}

/** Bind-friendly wrapper for `<ActionFormButton>`. */
export async function deleteManualJournalByIdAction(id: string): Promise<void> {
  const res = await deleteManualJournalAction(id);
  if (!res.ok) throw new Error(res.error ?? "Delete failed");
}
