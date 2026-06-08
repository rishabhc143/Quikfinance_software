import "server-only";

/**
 * AD-v3 — Stale invoice draft detector.
 *
 * Fires when an Invoice has status="DRAFT" and hasn't been touched
 * (updatedAt) in more than `STALE_DRAFT_DAYS` (default 7).
 *
 * Why this matters: DRAFT invoices are revenue the user STARTED
 * to bill but didn't send. Every day in DRAFT is delayed cashflow.
 * Common causes: someone opened the form, got interrupted, never
 * came back. The reminder converts to cash within 1-2 weeks of
 * sending in most cases.
 *
 * Severity:
 *   - HIGH if draft is >30 days old AND total > ₹50K
 *   - MEDIUM otherwise (passes threshold but smaller)
 *
 * Fingerprint per invoice id, so each stale draft gets its own
 * alert that the user can dismiss individually (e.g. "this draft
 * is intentionally pending the customer's PO").
 */

import { db } from "@/lib/db";
import type { DetectedAnomaly, DetectorFn } from "../types";
import { formatMoneyForDescription, fpKey } from "../util";

const STALE_DRAFT_DAYS = 7;
const HIGH_SEVERITY_DAYS = 30;
const HIGH_SEVERITY_MIN_AMOUNT = 50_000;

export const detectStaleInvoiceDraft: DetectorFn = async (organizationId, today) => {
  const cutoff = new Date(today.getTime() - STALE_DRAFT_DAYS * 86400000);
  const drafts = await db.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "DRAFT",
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      number: true,
      total: true,
      updatedAt: true,
      contact: { select: { displayName: true } },
    },
  });

  const out: DetectedAnomaly[] = [];
  for (const inv of drafts) {
    const ageDays = Math.floor(
      (today.getTime() - inv.updatedAt.getTime()) / 86400000
    );
    const total = Number(inv.total);
    const severity: "high" | "medium" =
      ageDays >= HIGH_SEVERITY_DAYS && total >= HIGH_SEVERITY_MIN_AMOUNT
        ? "high"
        : "medium";

    out.push({
      detectorKey: "stale_invoice_draft",
      severity,
      title: `Draft invoice ${inv.number} sitting for ${ageDays} days`,
      description:
        `Invoice ${inv.number} to ${inv.contact?.displayName ?? "customer"} ` +
        `for ${formatMoneyForDescription(total, "INR")} has been in DRAFT ` +
        `status since ${inv.updatedAt.toISOString().slice(0, 10)} ` +
        `(${ageDays} days). Either send it to start the collection clock, ` +
        `or delete if it's no longer needed.`,
      refType: "invoice",
      refId: inv.id,
      fingerprint: fpKey("stale_invoice_draft", [inv.id]),
    });
  }
  return out;
};
