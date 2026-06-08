import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { tallyPrimeParser } from "@/lib/migration/parsers/tally-prime";
import {
  indexVouchersByPartyGuid,
  ledgerToCreateInput,
  voucherToCreateInput,
} from "@/lib/migration/mapper";
import type { FormatParser, ParseResult } from "@/lib/migration/canonical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Parsing a 50MB Tally XML + bulk inserting can run 20–40s. The
// Hobby ceiling of 60s is comfortably enough for v1 (smaller
// uploads). When users start uploading 200MB exports we move
// parsing to a background worker — Phase 2.
export const maxDuration = 60;

/**
 * Tally Companion — upload endpoint.
 *
 * Accepts a Tally XML file via multipart, parses it via the
 * format parsers in lib/migration/parsers/, persists the results
 * into Companion* tables, and returns a summary the UI can show
 * inline.
 *
 * v1 keeps everything synchronous because the file size cap (10MB
 * enforced below) makes that safe inside Vercel's function
 * timeout. v2 will add background-job processing for larger
 * files.
 *
 * Idempotency:
 *   - createMany({ skipDuplicates: true }) on the partial unique
 *     index (orgId, sourceFormat, sourceGuid) WHERE deletedAt IS NULL
 *     means re-uploading the same file is safe — no duplicates.
 *
 * Atomicity:
 *   - The MigrationBatch row is created up-front.
 *   - Inserts run inside a single Prisma $transaction. On error,
 *     batch.status flips to 'failed' and all child rows are
 *     rolled back automatically.
 *
 * Party-link resolution:
 *   - Ledgers are inserted FIRST so we have their Prisma ids.
 *   - Vouchers are inserted with partyLedgerId=null.
 *   - A single UPDATE per ledger then patches partyLedgerId on
 *     all the vouchers that reference it via sourceGuid.
 */

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB v1 cap
const PARSERS: FormatParser[] = [tallyPrimeParser];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: Request) {
  const { user, organization } = await requireOrganization();

  // ── 1. Parse multipart, validate file ─────────────────────────
  const form = await req.formData().catch(() => null);
  if (!form) return badRequest("Expected multipart/form-data");

  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("Missing 'file' field");
  if (file.size === 0) return badRequest("File is empty");
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return badRequest(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB in v1; background-processing for larger files coming soon.`
    );
  }

  const xml = await file.text();
  if (!xml.trim().startsWith("<")) {
    return badRequest("File does not look like XML.");
  }

  // ── 2. Detect format + parse ──────────────────────────────────
  const sample = xml.slice(0, 4096);
  const parser = PARSERS.find((p) => p.detect(sample));
  if (!parser) {
    return badRequest(
      "Could not detect file format. Currently only Tally Prime XML is supported in v1."
    );
  }

  let parseResult: ParseResult;
  try {
    parseResult = await parser.parse(xml);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // ── 3. Create the MigrationBatch row ──────────────────────────
  const batch = await db.migrationBatch.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      sourceFormat: parseResult.sourceFormat,
      sourceFilename: file.name,
      sourceFilesizeB: file.size,
      status: "running",
      totalLedgers: parseResult.ledgers.length,
      totalVouchers: parseResult.vouchers.length,
      warnings: parseResult.warnings as unknown as object,
    },
    select: { id: true },
  });

  // ── 4. Persist ledgers + vouchers atomically ──────────────────
  try {
    await db.$transaction(async (tx) => {
      // Ledgers first so we have their ids for party resolution.
      if (parseResult.ledgers.length > 0) {
        await tx.companionLedger.createMany({
          data: parseResult.ledgers.map((l) =>
            ledgerToCreateInput(l, organization.id, batch.id)
          ),
          skipDuplicates: true,
        });
      }

      // Vouchers — partyLedgerId left null at insert.
      if (parseResult.vouchers.length > 0) {
        await tx.companionVoucher.createMany({
          data: parseResult.vouchers.map((v) =>
            voucherToCreateInput(v, organization.id, batch.id)
          ),
          skipDuplicates: true,
        });
      }

      // Resolve party links via single-pass UPDATE per ledger.
      // Cheaper than per-voucher updates for the common case
      // (many vouchers, few ledgers).
      const byParty = indexVouchersByPartyGuid(parseResult.vouchers);
      if (byParty.size > 0) {
        // Look up the freshly-inserted (or pre-existing) ledger
        // rows so we can find their ids by sourceGuid.
        const ledgerRows = await tx.companionLedger.findMany({
          where: {
            organizationId: organization.id,
            sourceFormat: parseResult.sourceFormat,
            sourceGuid: { in: Array.from(byParty.keys()) },
            deletedAt: null,
          },
          select: { id: true, sourceGuid: true },
        });
        for (const led of ledgerRows) {
          const linkedVouchers = byParty.get(led.sourceGuid) ?? [];
          if (linkedVouchers.length === 0) continue;
          await tx.companionVoucher.updateMany({
            where: {
              organizationId: organization.id,
              sourceFormat: parseResult.sourceFormat,
              sourceGuid: { in: linkedVouchers.map((v) => v.sourceGuid) },
              deletedAt: null,
            },
            data: { partyLedgerId: led.id },
          });
        }
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    await db.migrationBatch.update({
      where: { id: batch.id },
      data: { status: "failed", error: msg, completedAt: new Date() },
    });
    return NextResponse.json({ error: msg, batchId: batch.id }, { status: 500 });
  }

  // ── 5. Mark complete + set rollback window ────────────────────
  const completed = new Date();
  const rollbackExpiry = new Date(completed.getTime() + 30 * 86400000); // 30 days
  await db.migrationBatch.update({
    where: { id: batch.id },
    data: {
      status: "done",
      insertedLedgers: parseResult.ledgers.length,
      insertedVouchers: parseResult.vouchers.length,
      completedAt: completed,
      rollbackExpiresAt: rollbackExpiry,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "MigrationBatch",
    entityId: batch.id,
    after: {
      sourceFormat: parseResult.sourceFormat,
      sourceFilename: file.name,
      ledgers: parseResult.ledgers.length,
      vouchers: parseResult.vouchers.length,
      warnings: parseResult.warnings.length,
    },
  });

  return NextResponse.json({
    ok: true,
    batchId: batch.id,
    sourceFormat: parseResult.sourceFormat,
    counts: {
      ledgers: parseResult.ledgers.length,
      vouchers: parseResult.vouchers.length,
      warnings: parseResult.warnings.length,
    },
    warnings: parseResult.warnings,
    next: {
      historyUrl: "/settings/data/tally-companion",
    },
  });
}
