"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";
import { validateManualJournalLines } from "@/lib/accounting/manual-journal-validation";

/**
 * ACCT-A.2 — Manual Journals with Zoho-parity header fields.
 *
 *   createManualJournalAction        — header + lines, always PUBLISHED
 *   createManualJournalAndRedirectAction  — bind-friendly wrapper
 *   deleteManualJournalAction        — sweeps MJ:* AND MJ-REV:* JEs
 *   deleteManualJournalByIdAction    — bind-friendly wrapper
 *
 * Reference-key convention (see docs/accounting-architecture.md §3):
 *   MJ:<manualJournalId>      — the primary posting
 *   MJ-REV:<manualJournalId>  — the auto-reverse posting (set when
 *                                reverseJournalDate is provided)
 *
 * The schema includes a `status` column (DRAFT | PUBLISHED) for
 * forward-compat with ACCT-A.3's Save-as-Draft flow, but every
 * journal created via this action is PUBLISHED. Save-as-Draft needs
 * line-storage support — designed in ACCT-A.3.
 */

const lineSchema = z.object({
  accountId: z.string().min(1, "Pick an account for every line."),
  debit: z.coerce.number().nonnegative().default(0),
  credit: z.coerce.number().nonnegative().default(0),
  description: z.string().max(500).optional().nullable(),
});

const REPORTING_METHODS = [
  "ACCRUAL_AND_CASH",
  "ACCRUAL_ONLY",
  "CASH_ONLY",
] as const;

const createSchema = z.object({
  date: z.coerce.date(),
  notes: z.string().max(2000).optional().nullable(),
  referenceNumber: z.string().max(120).optional().nullable(),
  reportingMethod: z.enum(REPORTING_METHODS).default("ACCRUAL_AND_CASH"),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/i, "Currency must be a 3-letter ISO code")
    .optional()
    .nullable(),
  reverseJournalDate: z.coerce.date().optional().nullable(),
  publishReverseOnlyOnDate: z.coerce.boolean().default(false),
  lines: z.array(lineSchema).min(2, "Need at least two lines."),
});

export type ManualJournalInput = z.input<typeof createSchema>;

/** Verify every account belongs to this org. */
async function verifyAccountOwnership(
  client: Prisma.TransactionClient | typeof db,
  organizationId: string,
  lines: { accountId: string }[]
): Promise<string | null> {
  const accounts = await client.chartOfAccount.findMany({
    where: {
      id: { in: lines.map((l) => l.accountId) },
      organizationId,
    },
    select: { id: true },
  });
  const wanted = new Set(lines.map((l) => l.accountId));
  if (accounts.length !== wanted.size) {
    return "Some accounts not found in this org.";
  }
  return null;
}

/**
 * Post the primary JE + (optional) reverse JE in the caller's
 * transaction. Reverse JE flips DR ↔ CR and date-stamps to
 * `reverseJournalDate`.
 */
async function postJournalEntries(
  tx: Prisma.TransactionClient,
  organizationId: string,
  header: {
    id: string;
    number: string;
    date: Date;
    notes: string | null;
    reverseJournalDate: Date | null;
  },
  lines: {
    accountId: string;
    debit: number;
    credit: number;
    description: string | null;
  }[]
): Promise<void> {
  await tx.journalEntry.create({
    data: {
      organizationId,
      date: header.date,
      reference: `MJ:${header.id}`,
      notes: header.notes ?? `Manual journal ${header.number}`,
      lines: {
        create: lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
      },
    },
  });

  if (header.reverseJournalDate) {
    await tx.journalEntry.create({
      data: {
        organizationId,
        date: header.reverseJournalDate,
        reference: `MJ-REV:${header.id}`,
        notes: `Auto-reverse of manual journal ${header.number}`,
        lines: {
          create: lines.map((l) => ({
            accountId: l.accountId,
            // Flip DR ↔ CR.
            debit: l.credit,
            credit: l.debit,
            description: l.description,
          })),
        },
      },
    });
  }
}

// ───────────────────────── create ─────────────────────────

export async function createManualJournalAction(
  input: ManualJournalInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createSchema.parse(input);

  const lineErr = validateManualJournalLines(data.lines);
  if (lineErr) return { ok: false, error: lineErr };

  const accountErr = await verifyAccountOwnership(db, organization.id, data.lines);
  if (accountErr) return { ok: false, error: accountErr };

  const number = await nextDocumentNumber(organization.id, "manualJournal");

  const created = await db.$transaction(async (tx) => {
    const header = await tx.manualJournal.create({
      data: {
        organizationId: organization.id,
        number,
        date: data.date,
        notes: data.notes ?? null,
        referenceNumber: data.referenceNumber ?? null,
        // Every journal posted via this action is PUBLISHED (Save as
        // Draft lands in ACCT-A.3 with proper line storage).
        status: "PUBLISHED",
        reportingMethod: data.reportingMethod,
        currency: data.currency ? data.currency.toUpperCase() : null,
        reverseJournalDate: data.reverseJournalDate ?? null,
        publishReverseOnlyOnDate: data.publishReverseOnlyOnDate,
      },
    });
    await postJournalEntries(
      tx,
      organization.id,
      {
        id: header.id,
        number: header.number,
        date: header.date,
        notes: header.notes,
        reverseJournalDate: header.reverseJournalDate,
      },
      data.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? null,
      }))
    );
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
      hasReverse: !!data.reverseJournalDate,
      reportingMethod: data.reportingMethod,
    },
  });

  revalidatePath("/accountant/manual-journals");
  revalidatePath("/accountant/journal-entries");
  return { ok: true, id: created.id };
}

export async function createManualJournalAndRedirectAction(
  input: ManualJournalInput
): Promise<void> {
  const res = await createManualJournalAction(input);
  if (!res.ok || !res.id) {
    throw new Error(res.error ?? "Failed to create manual journal");
  }
  redirect(`/accountant/manual-journals/${res.id}`);
}

// ───────────────────────── delete ─────────────────────────

export async function deleteManualJournalAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const j = await db.manualJournal.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!j) return { ok: false, error: "Manual journal not found" };

  await db.$transaction([
    // Catch the primary MJ:<id> AND the reverse MJ-REV:<id> JE.
    db.journalEntry.deleteMany({
      where: {
        organizationId: organization.id,
        OR: [{ reference: `MJ:${id}` }, { reference: `MJ-REV:${id}` }],
      },
    }),
    db.manualJournal.delete({ where: { id } }),
  ]);

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "ManualJournal",
    entityId: id,
    before: { number: j.number, status: j.status },
  });

  revalidatePath("/accountant/manual-journals");
  revalidatePath("/accountant/journal-entries");
  return { ok: true };
}

export async function deleteManualJournalByIdAction(id: string): Promise<void> {
  const res = await deleteManualJournalAction(id);
  if (!res.ok) throw new Error(res.error ?? "Delete failed");
}
