"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  parseManualJournalsCsv,
  type ParseResult,
  type ParsedJournal,
} from "@/lib/accounting/manual-journals-import";

/**
 * ACCT-A.4.b — Server actions for the Bulk Import wizard.
 *
 *   parseManualJournalsCsvAction  — pure parse + validate; no DB writes.
 *                                    Returns a preview the wizard renders.
 *   importManualJournalsAction    — actually persists the previewed
 *                                    journals as DRAFTs (one txn per MJ).
 *
 * Both load the org's accounts / contacts / projects so the parser
 * can match by code + name without the client ever seeing the
 * actual ids.
 */

async function loadOrgLookups(organizationId: string) {
  const [accounts, contacts, projects] = await Promise.all([
    db.chartOfAccount.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, code: true, name: true },
    }),
    db.contact.findMany({
      where: { organizationId, isInactive: false, deletedAt: null },
      select: { id: true, displayName: true },
    }),
    db.project.findMany({
      where: { organizationId, status: "active" },
      select: { id: true, name: true },
    }),
  ]);

  const accountsByCode = new Map<string, { id: string }>();
  const accountsByName = new Map<string, { id: string }>();
  for (const a of accounts) {
    if (a.code) accountsByCode.set(a.code.trim().toUpperCase(), { id: a.id });
    accountsByName.set(a.name.trim().toLowerCase(), { id: a.id });
  }
  const contactsByName = new Map<string, { id: string }>();
  for (const c of contacts) {
    contactsByName.set(c.displayName.trim().toLowerCase(), { id: c.id });
  }
  const projectsByName = new Map<string, { id: string }>();
  for (const p of projects) {
    projectsByName.set(p.name.trim().toLowerCase(), { id: p.id });
  }

  return { accountsByCode, accountsByName, contactsByName, projectsByName };
}

/**
 * Parses the CSV in the caller's org scope and returns the preview
 * payload. Heavy enough to run server-side so the lookup maps don't
 * have to ship to the browser.
 */
export async function parseManualJournalsCsvAction(
  csv: string
): Promise<ParseResult> {
  const { organization } = await requireOrganization();
  const lookups = await loadOrgLookups(organization.id);
  return parseManualJournalsCsv({ csv, ...lookups });
}

export type ImportResult = {
  created: number;
  skipped: number;
  errors: { number: string; message: string }[];
};

/**
 * Persists each parsed journal as DRAFT in its own transaction.
 * Per-journal atomicity: a balance-violation in journal #3 still
 * lets #1 and #2 land. Duplicate Journal Numbers within the org
 * skip with a clear error.
 */
export async function importManualJournalsAction(
  journals: ParsedJournal[]
): Promise<ImportResult> {
  const { user, organization } = await requireOrganization();

  // De-dupe: scan org for existing numbers, skip imports that collide.
  const wantedNumbers = Array.from(new Set(journals.map((j) => j.number)));
  const existing = await db.manualJournal.findMany({
    where: { organizationId: organization.id, number: { in: wantedNumbers } },
    select: { number: true },
  });
  const taken = new Set(existing.map((e) => e.number));

  let created = 0;
  let skipped = 0;
  const errors: { number: string; message: string }[] = [];

  for (const j of journals) {
    if (taken.has(j.number)) {
      skipped += 1;
      errors.push({
        number: j.number,
        message: `Journal Number "${j.number}" already exists — skipped`,
      });
      continue;
    }

    try {
      await db.$transaction(async (tx) => {
        const header = await tx.manualJournal.create({
          data: {
            organizationId: organization.id,
            number: j.number,
            date: j.date,
            notes: j.notes,
            referenceNumber: j.referenceNumber,
            status: "DRAFT",
            reportingMethod: j.reportingMethod,
            currency: j.currency ? j.currency.toUpperCase() : null,
            // Imports never auto-reverse — the user can edit + add
            // a reverse date in the DRAFT before publishing.
            reverseJournalDate: null,
            publishReverseOnlyOnDate: false,
          },
        });
        await tx.manualJournalLine.createMany({
          data: j.lines.map((l, i) => ({
            manualJournalId: header.id,
            position: i,
            accountId: l.accountId,
            contactId: l.contactId,
            projectId: l.projectId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        });
      });
      // Now that the row exists, lock the number in the unique
      // index so a concurrent import of the same CSV can't double-create.
      taken.add(j.number);
      created += 1;
    } catch (err) {
      errors.push({
        number: j.number,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (created > 0) {
    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      entityType: "ManualJournal",
      entityId: "bulk-import",
      after: {
        kind: "bulk_import",
        created,
        skipped,
        errors: errors.length,
        firstNumber: journals[0]?.number ?? null,
      },
    });
    revalidatePath("/accountant/manual-journals");
  }

  return { created, skipped, errors };
}
