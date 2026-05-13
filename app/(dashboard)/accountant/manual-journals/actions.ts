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
import {
  flipDrCrLines,
  manualJournalReference,
  manualJournalReverseReference,
} from "@/lib/accounting/manual-journal-publish";

/**
 * ACCT-A.3 — Manual Journals with full DRAFT → PUBLISHED lifecycle.
 *
 *   createManualJournalAction               — writes header + ManualJournalLine.
 *                                              `saveAsDraft: true` skips JE post.
 *   updateManualJournalAction               — replaces header + lines on a DRAFT.
 *                                              Refuses to edit a PUBLISHED journal.
 *   publishManualJournalAction              — DRAFT → PUBLISHED: reads stored
 *                                              lines, validates, posts JEs.
 *   deleteManualJournalAction               — drops header + lines (FK cascade)
 *                                              and clears MJ:/MJ-REV: JEs if any.
 *
 * Bind-friendly wrappers for <ActionFormButton>:
 *   createManualJournalAndRedirectAction
 *   updateManualJournalAndRedirectAction
 *   publishManualJournalByIdAction
 *   deleteManualJournalByIdAction
 *
 * Reference-key convention (see docs/accounting-architecture.md §3):
 *   MJ:<manualJournalId>      — the primary posting
 *   MJ-REV:<manualJournalId>  — the auto-reverse posting (set when
 *                                reverseJournalDate is provided)
 *
 * Lines live in two places by design:
 *   ManualJournalLine  — human-editable source of truth (DRAFT + PUBLISHED)
 *   JournalEntryLine   — canonical ledger (PUBLISHED only; copied at publish)
 *
 * Reports read from JournalEntryLine; the form reads from ManualJournalLine.
 * Sync happens exactly at publish time. Delete cascades both via FK +
 * an explicit deleteMany on the MJ:* / MJ-REV:* references.
 */

const lineSchema = z.object({
  accountId: z.string().min(1, "Pick an account for every line."),
  /** ACCT-A.3.b — optional per-line dimensions. Empty string from
   *  the form's "—" option is normalised to null below. */
  contactId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  projectId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
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
  saveAsDraft: z.coerce.boolean().default(false),
  lines: z.array(lineSchema).min(2, "Need at least two lines."),
});

export type ManualJournalInput = z.input<typeof createSchema>;

type NormalisedLine = {
  accountId: string;
  contactId: string | null;
  projectId: string | null;
  debit: number;
  credit: number;
  description: string | null;
};

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
 * ACCT-A.3.b — Per-line dimensions must also belong to the caller's
 * org. Cheap follow-up check after account ownership; the queries
 * are guarded by `id IN (…)` so they're each a single index lookup.
 */
async function verifyLineDimsOwnership(
  client: Prisma.TransactionClient | typeof db,
  organizationId: string,
  lines: NormalisedLine[]
): Promise<string | null> {
  const contactIds = Array.from(
    new Set(lines.map((l) => l.contactId).filter((v): v is string => !!v))
  );
  const projectIds = Array.from(
    new Set(lines.map((l) => l.projectId).filter((v): v is string => !!v))
  );

  if (contactIds.length > 0) {
    const found = await client.contact.findMany({
      where: { id: { in: contactIds }, organizationId },
      select: { id: true },
    });
    if (found.length !== contactIds.length) {
      return "Some contacts not found in this org.";
    }
  }
  if (projectIds.length > 0) {
    const found = await client.project.findMany({
      where: { id: { in: projectIds }, organizationId },
      select: { id: true },
    });
    if (found.length !== projectIds.length) {
      return "Some projects not found in this org.";
    }
  }
  return null;
}

/**
 * Replace the line set on a ManualJournal: delete-all-then-create.
 * Runs inside the caller's transaction so it's atomic.
 */
async function replaceManualJournalLines(
  tx: Prisma.TransactionClient,
  manualJournalId: string,
  lines: NormalisedLine[]
): Promise<void> {
  await tx.manualJournalLine.deleteMany({ where: { manualJournalId } });
  if (lines.length === 0) return;
  await tx.manualJournalLine.createMany({
    data: lines.map((l, i) => ({
      manualJournalId,
      position: i,
      accountId: l.accountId,
      contactId: l.contactId,
      projectId: l.projectId,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
    })),
  });
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
  lines: NormalisedLine[]
): Promise<void> {
  await tx.journalEntry.create({
    data: {
      organizationId,
      date: header.date,
      reference: manualJournalReference(header.id),
      notes: header.notes ?? `Manual journal ${header.number}`,
      lines: {
        create: lines.map((l) => ({
          accountId: l.accountId,
          contactId: l.contactId,
          projectId: l.projectId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
      },
    },
  });

  if (header.reverseJournalDate) {
    const reversed = flipDrCrLines(lines);
    await tx.journalEntry.create({
      data: {
        organizationId,
        date: header.reverseJournalDate,
        reference: manualJournalReverseReference(header.id),
        notes: `Auto-reverse of manual journal ${header.number}`,
        lines: {
          create: reversed.map((l) => ({
            accountId: l.accountId,
            contactId: l.contactId,
            projectId: l.projectId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        },
      },
    });
  }
}

function normaliseLines(input: ManualJournalInput["lines"]): NormalisedLine[] {
  return input.map((l) => ({
    accountId: l.accountId,
    contactId: l.contactId ?? null,
    projectId: l.projectId ?? null,
    debit: Number(l.debit ?? 0),
    credit: Number(l.credit ?? 0),
    description: l.description ?? null,
  }));
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
  const normLines = normaliseLines(data.lines);

  const dimsErr = await verifyLineDimsOwnership(db, organization.id, normLines);
  if (dimsErr) return { ok: false, error: dimsErr };

  const status = data.saveAsDraft ? "DRAFT" : "PUBLISHED";

  const created = await db.$transaction(async (tx) => {
    const header = await tx.manualJournal.create({
      data: {
        organizationId: organization.id,
        number,
        date: data.date,
        notes: data.notes ?? null,
        referenceNumber: data.referenceNumber ?? null,
        status,
        reportingMethod: data.reportingMethod,
        currency: data.currency ? data.currency.toUpperCase() : null,
        reverseJournalDate: data.reverseJournalDate ?? null,
        publishReverseOnlyOnDate: data.publishReverseOnlyOnDate,
      },
    });
    // Always persist the editable line copy.
    await replaceManualJournalLines(tx, header.id, normLines);

    if (!data.saveAsDraft) {
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
        normLines
      );
    }
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
      status,
      totalDebit: normLines.reduce((s, l) => s + l.debit, 0),
      lines: normLines.length,
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

// ───────────────────────── update (DRAFT-only) ─────────────────────────

export async function updateManualJournalAction(
  id: string,
  input: ManualJournalInput
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createSchema.parse(input);

  const existing = await db.manualJournal.findFirst({
    where: { id, organizationId: organization.id },
    select: { id: true, number: true, status: true },
  });
  if (!existing) return { ok: false, error: "Manual journal not found" };
  if (existing.status === "PUBLISHED") {
    return {
      ok: false,
      error:
        "Published journals can't be edited — post a reversing manual journal instead.",
    };
  }

  const lineErr = validateManualJournalLines(data.lines);
  if (lineErr) return { ok: false, error: lineErr };

  const accountErr = await verifyAccountOwnership(db, organization.id, data.lines);
  if (accountErr) return { ok: false, error: accountErr };

  const normLines = normaliseLines(data.lines);

  const dimsErr = await verifyLineDimsOwnership(db, organization.id, normLines);
  if (dimsErr) return { ok: false, error: dimsErr };

  const targetStatus = data.saveAsDraft ? "DRAFT" : "PUBLISHED";

  await db.$transaction(async (tx) => {
    // Re-check status under the transaction in case another tab
    // published the same row mid-edit.
    const fresh = await tx.manualJournal.findFirst({
      where: { id, organizationId: organization.id },
      select: { status: true },
    });
    if (!fresh) {
      throw new Error("Manual journal not found");
    }
    if (fresh.status === "PUBLISHED") {
      throw new Error(
        "Published journals can't be edited — post a reversing manual journal instead."
      );
    }

    await tx.manualJournal.update({
      where: { id },
      data: {
        date: data.date,
        notes: data.notes ?? null,
        referenceNumber: data.referenceNumber ?? null,
        reportingMethod: data.reportingMethod,
        currency: data.currency ? data.currency.toUpperCase() : null,
        reverseJournalDate: data.reverseJournalDate ?? null,
        publishReverseOnlyOnDate: data.publishReverseOnlyOnDate,
      },
    });
    await replaceManualJournalLines(tx, id, normLines);

    if (!data.saveAsDraft) {
      // Save and Publish from the edit form: post JEs inline and
      // flip status, all in the same transaction so the row is
      // never observed in a half-published state.
      const header = await tx.manualJournal.findFirstOrThrow({
        where: { id, organizationId: organization.id },
        select: {
          id: true,
          number: true,
          date: true,
          notes: true,
          reverseJournalDate: true,
        },
      });
      await postJournalEntries(tx, organization.id, header, normLines);
      await tx.manualJournal.update({
        where: { id },
        data: { status: "PUBLISHED" },
      });
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "ManualJournal",
    entityId: id,
    after: {
      number: existing.number,
      status: targetStatus,
      totalDebit: normLines.reduce((s, l) => s + l.debit, 0),
      lines: normLines.length,
      hasReverse: !!data.reverseJournalDate,
      reportingMethod: data.reportingMethod,
    },
  });

  revalidatePath("/accountant/manual-journals");
  revalidatePath(`/accountant/manual-journals/${id}`);
  revalidatePath("/accountant/journal-entries");
  return { ok: true };
}

export async function updateManualJournalAndRedirectAction(
  id: string,
  input: ManualJournalInput
): Promise<void> {
  const res = await updateManualJournalAction(id, input);
  if (!res.ok) {
    throw new Error(res.error ?? "Failed to update manual journal");
  }
  redirect(`/accountant/manual-journals/${id}`);
}

// ───────────────────────── publish (DRAFT → PUBLISHED) ─────────────────────────

export async function publishManualJournalAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();

  const mj = await db.manualJournal.findFirst({
    where: { id, organizationId: organization.id },
    include: {
      lines: { orderBy: { position: "asc" } },
    },
  });
  if (!mj) return { ok: false, error: "Manual journal not found" };
  // Idempotent: publishing a PUBLISHED journal is a no-op.
  if (mj.status === "PUBLISHED") return { ok: true };

  const linesForValidation: NormalisedLine[] = mj.lines.map((l) => ({
    accountId: l.accountId,
    contactId: l.contactId,
    projectId: l.projectId,
    debit: Number(l.debit),
    credit: Number(l.credit),
    description: l.description,
  }));
  if (linesForValidation.length < 2) {
    return { ok: false, error: "Need at least two lines before publishing." };
  }

  const lineErr = validateManualJournalLines(linesForValidation);
  if (lineErr) return { ok: false, error: lineErr };

  const accountErr = await verifyAccountOwnership(
    db,
    organization.id,
    linesForValidation
  );
  if (accountErr) return { ok: false, error: accountErr };

  // Re-validate dims at publish time — covers the rare case where
  // a contact or project was deleted while the draft sat.
  const dimsErr = await verifyLineDimsOwnership(
    db,
    organization.id,
    linesForValidation
  );
  if (dimsErr) return { ok: false, error: dimsErr };

  await db.$transaction(async (tx) => {
    // Status guard inside the tx — protects against a concurrent
    // publish from another tab.
    const fresh = await tx.manualJournal.findFirstOrThrow({
      where: { id, organizationId: organization.id },
      select: { status: true },
    });
    if (fresh.status === "PUBLISHED") return;

    await postJournalEntries(
      tx,
      organization.id,
      {
        id: mj.id,
        number: mj.number,
        date: mj.date,
        notes: mj.notes,
        reverseJournalDate: mj.reverseJournalDate,
      },
      linesForValidation
    );
    await tx.manualJournal.update({
      where: { id },
      data: { status: "PUBLISHED" },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "ManualJournal",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "PUBLISHED", number: mj.number },
  });

  revalidatePath("/accountant/manual-journals");
  revalidatePath(`/accountant/manual-journals/${id}`);
  revalidatePath("/accountant/journal-entries");
  return { ok: true };
}

export async function publishManualJournalByIdAction(id: string): Promise<void> {
  const res = await publishManualJournalAction(id);
  if (!res.ok) throw new Error(res.error ?? "Publish failed");
  redirect(`/accountant/manual-journals/${id}`);
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

  // FK cascade drops ManualJournalLine rows for us. We still need
  // to manually sweep the JEs since their join key is the structured
  // `reference` string, not a real FK.
  await db.$transaction([
    db.journalEntry.deleteMany({
      where: {
        organizationId: organization.id,
        OR: [
          { reference: manualJournalReference(id) },
          { reference: manualJournalReverseReference(id) },
        ],
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
