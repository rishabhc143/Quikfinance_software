import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { csvResponse, csvDateSuffix } from "@/lib/reports/csv-export";
import {
  buildManualJournalCsv,
  type ManualJournalCsvLine,
} from "@/lib/accounting/manual-journals-csv";

/**
 * ACCT-A.4.a — Manual Journals bulk export.
 *
 * GET /accountant/manual-journals/export?from=&to=&status=&q=
 *
 * Streams a CSV with **one row per line** (the Zoho-compatible
 * layout). Both DRAFT and PUBLISHED journals are eligible: DRAFTs
 * pull their lines from `ManualJournalLine`, PUBLISHED ones pull
 * from the canonical `JournalEntryLine` under reference `MJ:<id>`
 * so the export matches what's actually on the ledger.
 *
 * Query params (all optional):
 *   - from   `yyyy-mm-dd`  default = 90 days ago
 *   - to     `yyyy-mm-dd`  default = today
 *   - status DRAFT | PUBLISHED | ALL  default = ALL
 *   - q      free-text search (matches `number` / `notes`)
 *
 * Filtering mirrors the list page filters one-for-one so what the
 * accountant sees in the table is what they get in the file.
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const url = req.nextUrl;

  // ── Filters ────────────────────────────────────────────────────
  const today = new Date();
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 86_400_000);
  const from = parseIsoDate(url.searchParams.get("from")) ?? ninetyDaysAgo;
  const to = parseIsoDate(url.searchParams.get("to")) ?? today;
  // Pull the whole day, end-of-day-inclusive.
  to.setUTCHours(23, 59, 59, 999);

  const statusParam = (url.searchParams.get("status") ?? "ALL").toUpperCase();
  const status =
    statusParam === "DRAFT" || statusParam === "PUBLISHED"
      ? statusParam
      : null;

  const q = (url.searchParams.get("q") ?? "").trim();

  const where: Prisma.ManualJournalWhereInput = {
    organizationId: organization.id,
    date: { gte: from, lte: to },
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { notes: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // ── Load journals + their lines ───────────────────────────────
  const journals = await db.manualJournal.findMany({
    where,
    orderBy: { date: "asc" },
    include: {
      lines: {
        orderBy: { position: "asc" },
        include: {
          account: { select: { code: true, name: true } },
          contact: { select: { displayName: true } },
          project: { select: { name: true } },
        },
      },
    },
  });

  // PUBLISHED journals: prefer the JournalEntryLine rows (the
  // canonical ledger). That way the export agrees with what reports
  // show. DRAFT journals only exist in ManualJournalLine.
  const publishedRefs = journals
    .filter((j) => j.status === "PUBLISHED")
    .map((j) => `MJ:${j.id}`);
  const publishedJes = publishedRefs.length
    ? await db.journalEntry.findMany({
        where: {
          organizationId: organization.id,
          reference: { in: publishedRefs },
        },
        include: {
          lines: {
            include: {
              account: { select: { code: true, name: true } },
              contact: { select: { displayName: true } },
              project: { select: { name: true } },
            },
          },
        },
      })
    : [];
  const jeByMjId = new Map<string, (typeof publishedJes)[number]>();
  for (const je of publishedJes) {
    if (!je.reference?.startsWith("MJ:")) continue;
    jeByMjId.set(je.reference.slice("MJ:".length), je);
  }

  // ── Flatten into one row per line ─────────────────────────────
  const orgCurrency = organization.currency;
  const flat: ManualJournalCsvLine[] = [];

  for (const j of journals) {
    const currency = j.currency ?? orgCurrency;
    const headerFields = {
      date: j.date,
      number: j.number,
      referenceNumber: j.referenceNumber,
      status: j.status,
      notes: j.notes,
      currency,
      reportingMethod: j.reportingMethod,
    };

    const je = j.status === "PUBLISHED" ? jeByMjId.get(j.id) : undefined;
    if (je && je.lines.length > 0) {
      for (const l of je.lines) {
        flat.push({
          ...headerFields,
          accountCode: l.account.code,
          accountName: l.account.name,
          description: l.description,
          debit: Number(l.debit),
          credit: Number(l.credit),
          contactName: l.contact?.displayName ?? null,
          projectName: l.project?.name ?? null,
        });
      }
    } else {
      for (const l of j.lines) {
        flat.push({
          ...headerFields,
          accountCode: l.account.code,
          accountName: l.account.name,
          description: l.description,
          debit: Number(l.debit),
          credit: Number(l.credit),
          contactName: l.contact?.displayName ?? null,
          projectName: l.project?.name ?? null,
        });
      }
    }
  }

  const csv = buildManualJournalCsv(flat);
  return csvResponse(`manual-journals-${csvDateSuffix(today)}`, csv);
}

/** Parse `yyyy-mm-dd` strictly; returns null on bad input. */
function parseIsoDate(s: string | null): Date | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}
