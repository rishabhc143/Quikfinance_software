import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  ReconciliationReport,
  type ReconciliationData,
} from "@/lib/migration/reconciliation-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Sprint 5 — Reconciliation report PDF for a single MigrationBatch.
 *
 * GET /api/companion/batches/<id>/reconciliation
 *
 * Streams the PDF inline. The Companion landing page links to this
 * URL for every Done batch — customer downloads + hands to CA for
 * sign-off.
 *
 * Org-scoped: 404 if the batch doesn't belong to the caller's org.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { organization } = await requireOrganization();

  const batch = await db.migrationBatch.findFirst({
    where: { id: params.id, organizationId: organization.id },
    select: {
      id: true,
      sourceFormat: true,
      sourceFilename: true,
      sourceFilesizeB: true,
      startedAt: true,
      completedAt: true,
      insertedLedgers: true,
      insertedVouchers: true,
      warnings: true,
    },
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  // ── Voucher totals by type (across this org's CURRENT state,
  //    not just this batch — gives the CA the snapshot they'd see
  //    if they looked at Quikfinance today). ────────────────────
  const voucherAgg = await db.companionVoucher.groupBy({
    by: ["type"],
    where: { organizationId: organization.id, deletedAt: null },
    _count: { type: true },
    _sum: { total: true },
  });
  const voucherTotalsByType = voucherAgg
    .map((g) => ({
      type: g.type,
      count: g._count.type,
      total: Number(g._sum.total ?? 0),
    }))
    .sort((a, b) => b.total - a.total);

  // ── Ledger counts by kind ──────────────────────────────────
  const ledgerAgg = await db.companionLedger.groupBy({
    by: ["kind"],
    where: { organizationId: organization.id, deletedAt: null },
    _count: { kind: true },
  });
  const ledgerCountsByKind = ledgerAgg
    .map((g) => ({ kind: g.kind, count: g._count.kind }))
    .sort((a, b) => b.count - a.count);

  // ── Top 10 AR + AP by outstanding (total - paidAmount) ──────
  const salesRows = await db.companionVoucher.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      type: "sales",
      partyLedgerId: { not: null },
    },
    select: {
      total: true,
      paidAmount: true,
      partyLedger: { select: { displayName: true } },
    },
  });
  const arMap = new Map<string, { party: string; outstanding: number; voucherCount: number }>();
  for (const r of salesRows) {
    const party = r.partyLedger?.displayName ?? "Unknown";
    const out = Number(r.total) - Number(r.paidAmount);
    if (out <= 0.005) continue;
    const cur = arMap.get(party) ?? { party, outstanding: 0, voucherCount: 0 };
    cur.outstanding += out;
    cur.voucherCount += 1;
    arMap.set(party, cur);
  }
  const topAr = Array.from(arMap.values())
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 10);

  const purchaseRows = await db.companionVoucher.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      type: "purchase",
      partyLedgerId: { not: null },
    },
    select: {
      total: true,
      paidAmount: true,
      partyLedger: { select: { displayName: true } },
    },
  });
  const apMap = new Map<string, { party: string; outstanding: number; voucherCount: number }>();
  for (const r of purchaseRows) {
    const party = r.partyLedger?.displayName ?? "Unknown";
    const out = Number(r.total) - Number(r.paidAmount);
    if (out <= 0.005) continue;
    const cur = apMap.get(party) ?? { party, outstanding: 0, voucherCount: 0 };
    cur.outstanding += out;
    cur.voucherCount += 1;
    apMap.set(party, cur);
  }
  const topAp = Array.from(apMap.values())
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 10);

  const data: ReconciliationData = {
    organization: {
      name: organization.name,
      currency: organization.currency,
    },
    batch: {
      id: batch.id,
      sourceFormat: batch.sourceFormat,
      sourceFilename: batch.sourceFilename,
      sourceFilesizeB: batch.sourceFilesizeB,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      insertedLedgers: batch.insertedLedgers,
      insertedVouchers: batch.insertedVouchers,
      warnings: Array.isArray(batch.warnings)
        ? (batch.warnings as unknown as { code: string; message: string }[])
        : [],
    },
    voucherTotalsByType,
    ledgerCountsByKind,
    topAr,
    topAp,
  };

  const buffer = await renderToBuffer(ReconciliationReport({ data }));
  const safeName = batch.sourceFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Buffer → Uint8Array so Response's BodyInit accepts it on Node 20.
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reconciliation-${safeName}.pdf"`,
    },
  });
}
