"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { validateManualJournalLines } from "@/lib/accounting/manual-journal-validation";
import type { RecurringManualJournalTemplate } from "@/lib/accounting/recurring-manual-journals";

/**
 * ACCT-A.4.c — Server actions for Recurring Manual Journals.
 *
 *   createRecurringManualJournalAction — saves a new profile.
 *   deleteRecurringManualJournalAction — soft-deletes + clears
 *                                         back-refs on generated MJs.
 *   pauseRecurringManualJournalAction  — flips status to PAUSED.
 *   resumeRecurringManualJournalAction — flips status to ACTIVE.
 *
 * The cron at /api/cron/recurring-manual-journals is the only
 * thing that calls the generator helpers in lib/accounting/.
 */

const lineSchema = z.object({
  accountId: z.string().min(1, "Pick an account on every line"),
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
  /** ACCT-A.3.b.2 — per-line reporting tag ids. */
  tagIds: z.array(z.string()).optional().default([]),
  debit: z.coerce.number().nonnegative().default(0),
  credit: z.coerce.number().nonnegative().default(0),
  description: z.string().max(500).optional().nullable(),
});

const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;

const createSchema = z.object({
  profileName: z.string().min(1, "Name the recurring profile").max(160),
  frequency: z.enum(FREQUENCIES),
  intervalN: z.coerce.number().int().min(1).max(99).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  neverExpires: z.coerce.boolean().default(false),
  referenceNumber: z.string().max(120).optional().nullable(),
  reportingMethod: z
    .enum(["ACCRUAL_AND_CASH", "ACCRUAL_ONLY", "CASH_ONLY"])
    .default("ACCRUAL_AND_CASH"),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/i, "Currency must be a 3-letter ISO code")
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(2, "Need at least two lines"),
});

export type RecurringManualJournalInput = z.input<typeof createSchema>;

// ──────────────────── create ────────────────────

export async function createRecurringManualJournalAction(
  input: RecurringManualJournalInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createSchema.parse(input);

  const lineErr = validateManualJournalLines(data.lines);
  if (lineErr) return { ok: false, error: lineErr };

  // Verify every account / contact / project / tag belongs to this org.
  const accountIds = Array.from(new Set(data.lines.map((l) => l.accountId)));
  const contactIds = Array.from(
    new Set(
      data.lines
        .map((l) => l.contactId)
        .filter((v): v is string => typeof v === "string" && !!v)
    )
  );
  const projectIds = Array.from(
    new Set(
      data.lines
        .map((l) => l.projectId)
        .filter((v): v is string => typeof v === "string" && !!v)
    )
  );
  const tagIds = Array.from(
    new Set(data.lines.flatMap((l) => l.tagIds ?? []).filter((t) => !!t))
  );

  const [accounts, contacts, projects, tags] = await Promise.all([
    db.chartOfAccount.findMany({
      where: { id: { in: accountIds }, organizationId: organization.id },
      select: { id: true },
    }),
    contactIds.length
      ? db.contact.findMany({
          where: { id: { in: contactIds }, organizationId: organization.id },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    projectIds.length
      ? db.project.findMany({
          where: { id: { in: projectIds }, organizationId: organization.id },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    tagIds.length
      ? db.reportingTag.findMany({
          where: { id: { in: tagIds }, organizationId: organization.id },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
  ]);
  if (accounts.length !== accountIds.length)
    return { ok: false, error: "Some accounts not found in this org" };
  if (contacts.length !== contactIds.length)
    return { ok: false, error: "Some contacts not found in this org" };
  if (projects.length !== projectIds.length)
    return { ok: false, error: "Some projects not found in this org" };
  if (tags.length !== tagIds.length)
    return { ok: false, error: "Some reporting tags not found in this org" };

  const template: RecurringManualJournalTemplate = {
    referenceNumber: data.referenceNumber ?? null,
    reportingMethod: data.reportingMethod,
    currency: data.currency ? data.currency.toUpperCase() : null,
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({
      accountId: l.accountId,
      contactId: l.contactId ?? null,
      projectId: l.projectId ?? null,
      tagIds: Array.from(new Set((l.tagIds ?? []).filter((t) => !!t))),
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
      description: l.description ?? null,
    })),
  };

  const profile = await db.recurringManualJournal.create({
    data: {
      organizationId: organization.id,
      profileName: data.profileName,
      frequency: data.frequency,
      intervalN: data.intervalN,
      startDate: data.startDate,
      endDate: data.neverExpires ? null : data.endDate ?? null,
      neverExpires: data.neverExpires,
      // First occurrence fires on startDate.
      nextOccurrenceDate: data.startDate,
      status: "ACTIVE",
      templateJson: template,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "RecurringManualJournal",
    entityId: profile.id,
    after: {
      profileName: profile.profileName,
      frequency: profile.frequency,
      intervalN: profile.intervalN,
      startDate: profile.startDate,
      lines: template.lines.length,
    },
  });

  revalidatePath("/accountant/recurring-manual-journals");
  return { ok: true, id: profile.id };
}

export async function createRecurringManualJournalAndRedirectAction(
  input: RecurringManualJournalInput
): Promise<void> {
  const res = await createRecurringManualJournalAction(input);
  if (!res.ok || !res.id) {
    throw new Error(res.error ?? "Failed to create recurring profile");
  }
  redirect(`/accountant/recurring-manual-journals/${res.id}`);
}

// ──────────────────── delete (soft) ────────────────────

export async function deleteRecurringManualJournalAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const profile = await db.recurringManualJournal.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!profile) return { ok: false, error: "Profile not found" };

  await db.recurringManualJournal.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      status: "STOPPED",
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "RecurringManualJournal",
    entityId: id,
    before: { profileName: profile.profileName, status: profile.status },
  });

  revalidatePath("/accountant/recurring-manual-journals");
  return { ok: true };
}

export async function deleteRecurringManualJournalByIdAction(
  id: string
): Promise<void> {
  const res = await deleteRecurringManualJournalAction(id);
  if (!res.ok) throw new Error(res.error ?? "Delete failed");
}

// ──────────────────── pause / resume ────────────────────

async function setStatus(
  id: string,
  nextStatus: "ACTIVE" | "PAUSED"
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const profile = await db.recurringManualJournal.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!profile) return { ok: false, error: "Profile not found" };
  if (profile.status === "EXPIRED" || profile.status === "STOPPED") {
    return {
      ok: false,
      error: `Can't change status of a ${profile.status} profile`,
    };
  }

  await db.recurringManualJournal.update({
    where: { id },
    data: { status: nextStatus, isActive: nextStatus === "ACTIVE" },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringManualJournal",
    entityId: id,
    before: { status: profile.status },
    after: { status: nextStatus },
  });

  revalidatePath("/accountant/recurring-manual-journals");
  revalidatePath(`/accountant/recurring-manual-journals/${id}`);
  return { ok: true };
}

export async function pauseRecurringManualJournalByIdAction(
  id: string
): Promise<void> {
  const res = await setStatus(id, "PAUSED");
  if (!res.ok) throw new Error(res.error ?? "Pause failed");
}

export async function resumeRecurringManualJournalByIdAction(
  id: string
): Promise<void> {
  const res = await setStatus(id, "ACTIVE");
  if (!res.ok) throw new Error(res.error ?? "Resume failed");
}
