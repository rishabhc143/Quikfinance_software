import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAnomalyDetectors } from "@/lib/anomaly/run-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * CF-7 — One-shot demo seeder.
 *
 * Purpose: let the maintainer prove the anomaly detector end-to-end
 * in prod WITHOUT needing access to the encrypted `DATABASE_URL` /
 * `CRON_SECRET`. Both are unreadable from `vercel env pull` (Vercel
 * doesn't decrypt sensitive vars for the CLI), so the normal path —
 * connect to the prod DB, insert two fake bills, then curl the cron
 * with its bearer — is closed.
 *
 * Instead, this route is gated by `MIGRATION_KEY` (which IS readable
 * from the CLI, since it was set as a non-encrypted env). On POST it
 * creates a clearly-labelled "[DEMO] Anomaly Vendor" contact and two
 * "DEMO-DUP-A" / "DEMO-DUP-B" bills (same vendor, same total ₹50,000,
 * 3 days apart, both OPEN), runs `runAnomalyDetectors`, and returns
 * the resulting alert ids.
 *
 * Sister mode `?cleanup=1` soft-deletes those rows and the alert row
 * so the user's bill list / alert inbox aren't polluted afterwards.
 *
 * Once you've demoed the feature, this route can be removed — it's
 * not referenced by any UI or scheduled job.
 */

const SEED_VENDOR_NAME = "[DEMO] Anomaly Vendor";
const SEED_BILL_A = "DEMO-DUP-A";
const SEED_BILL_B = "DEMO-DUP-B";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

async function authorize(req: Request) {
  const expected = process.env.MIGRATION_KEY;
  if (!expected) return { ok: false as const, message: "MIGRATION_KEY not set" };
  const header = req.headers.get("x-migration-key");
  if (header !== expected) return { ok: false as const };
  return { ok: true as const };
}

async function findTargetOrg(orgIdInBody?: string) {
  if (orgIdInBody) {
    const o = await db.organization.findUnique({
      where: { id: orgIdInBody },
      select: { id: true, name: true, currency: true },
    });
    return o;
  }
  // Default: first (and usually only) organization. Quikfinance is
  // single-tenant per deployment for this account.
  return db.organization.findFirst({
    select: { id: true, name: true, currency: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return unauthorized();

  const url = new URL(req.url);
  const cleanup = url.searchParams.get("cleanup") === "1";
  const body = (await req.json().catch(() => ({}))) as { orgId?: string };

  const org = await findTargetOrg(body.orgId);
  if (!org) {
    return NextResponse.json({ error: "no organization found" }, { status: 404 });
  }

  // ── CLEANUP MODE ────────────────────────────────────────────────
  if (cleanup) {
    const vendor = await db.contact.findFirst({
      where: { organizationId: org.id, displayName: SEED_VENDOR_NAME },
      select: { id: true },
    });
    if (!vendor) {
      return NextResponse.json({
        ok: true,
        organizationId: org.id,
        message: "Demo vendor not found — nothing to clean up.",
      });
    }
    const bills = await db.bill.findMany({
      where: {
        organizationId: org.id,
        contactId: vendor.id,
        number: { in: [SEED_BILL_A, SEED_BILL_B] },
        deletedAt: null,
      },
      select: { id: true },
    });
    const now = new Date();
    await db.$transaction([
      // Soft-delete bills (matches the codebase's soft-delete convention).
      db.bill.updateMany({
        where: { id: { in: bills.map((b) => b.id) } },
        data: { deletedAt: now },
      }),
      // Mark vendor inactive rather than hard-deleting (preserves FKs).
      db.contact.update({
        where: { id: vendor.id },
        data: { isInactive: true },
      }),
      // Hard-delete the AnomalyAlert rows the demo created — they
      // reference the now-deleted bills, so they'd be misleading if
      // left around.
      db.anomalyAlert.deleteMany({
        where: {
          organizationId: org.id,
          detectorKey: "duplicate_bill",
          refId: { in: bills.map((b) => b.id) },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      organizationId: org.id,
      cleanedUp: {
        billsSoftDeleted: bills.length,
        vendorMarkedInactive: true,
      },
    });
  }

  // ── SEED MODE ───────────────────────────────────────────────────
  // 1. Vendor — find-or-create. Re-running the seeder shouldn't
  //    create N copies of the demo vendor.
  let vendor = await db.contact.findFirst({
    where: { organizationId: org.id, displayName: SEED_VENDOR_NAME },
    select: { id: true },
  });
  if (!vendor) {
    vendor = await db.contact.create({
      data: {
        organizationId: org.id,
        type: "VENDOR",
        displayName: SEED_VENDOR_NAME,
        companyName: SEED_VENDOR_NAME,
        currency: org.currency,
        notes:
          "Auto-created by /api/admin/anomaly-demo. " +
          "Safe to soft-delete via ?cleanup=1.",
      },
      select: { id: true },
    });
  } else {
    // If the vendor exists but was previously marked inactive (e.g.
    // from a prior cleanup), un-toggle it so the bills below aren't
    // orphaned-from-a-soft-deleted-vendor.
    await db.contact.update({
      where: { id: vendor.id },
      data: { isInactive: false },
    });
  }

  // 2. Bills — re-runnable. If a bill with the same number already
  //    exists for this org+vendor and is not soft-deleted, reuse it;
  //    otherwise create. Both bills have the SAME total ₹50,000 to
  //    trigger the duplicate detector.
  const today = new Date();
  const dayMs = 86400000;
  const dateA = new Date(today.getTime() - 5 * dayMs); // 5 days ago
  const dateB = new Date(today.getTime() - 2 * dayMs); // 2 days ago → 3 days apart
  const dueDays = 30;

  async function findOrCreateBill(num: string, issue: Date) {
    const existing = await db.bill.findFirst({
      where: {
        organizationId: org!.id,
        contactId: vendor!.id,
        number: num,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      // Ensure it's still OPEN (in case a previous demo run marked it
      // PAID via a manual payment). Bump status + clear paid amount.
      await db.bill.update({
        where: { id: existing.id },
        data: {
          status: "OPEN",
          amountPaid: 0,
        },
      });
      return existing.id;
    }
    const created = await db.bill.create({
      data: {
        organizationId: org!.id,
        contactId: vendor!.id,
        number: num,
        status: "OPEN",
        issueDate: issue,
        dueDate: new Date(issue.getTime() + dueDays * dayMs),
        subtotal: 50000,
        total: 50000,
        amountPaid: 0,
        currency: org!.currency,
      },
      select: { id: true },
    });
    return created.id;
  }

  const billAId = await findOrCreateBill(SEED_BILL_A, dateA);
  const billBId = await findOrCreateBill(SEED_BILL_B, dateB);

  // 3. Run detectors. Returns counts; we also fetch the actual alert
  //    rows so the response shows what the user will see in the UI.
  const result = await runAnomalyDetectors(org.id, today);

  const openAlerts = await db.anomalyAlert.findMany({
    where: {
      organizationId: org.id,
      status: "open",
    },
    select: {
      id: true,
      detectorKey: true,
      severity: true,
      title: true,
      description: true,
      refType: true,
      refId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    ok: true,
    organizationId: org.id,
    organizationName: org.name,
    vendor: { id: vendor.id, displayName: SEED_VENDOR_NAME },
    bills: [
      { id: billAId, number: SEED_BILL_A, issueDate: dateA.toISOString(), total: 50000 },
      { id: billBId, number: SEED_BILL_B, issueDate: dateB.toISOString(), total: 50000 },
    ],
    detector: result, // { detected, inserted, skipped }
    openAlertsPreview: openAlerts,
    next: {
      uiUrl: "/cashflow/alerts",
      cleanupCommand: "POST same URL with ?cleanup=1",
    },
  });
}
