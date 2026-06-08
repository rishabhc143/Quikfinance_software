import "server-only";

/**
 * AD-v2 — Customer AR overdue-jump detector.
 *
 * Fires when a customer's TOTAL outstanding AR has risen more than
 * `JUMP_THRESHOLD_PCT` (default 50%) week-over-week, AND the
 * absolute jump is above `MIN_ABSOLUTE_JUMP` (default ₹50K).
 *
 * Why two thresholds:
 *   - Percentage alone: a customer who owed ₹1K last week and ₹2K
 *     this week triggers a 100% jump, but it's noise. The absolute
 *     floor filters those out.
 *   - Absolute alone: a 5% jump on ₹50L outstanding doesn't surface,
 *     but a 100% jump on ₹50K does. The percentage gate keeps the
 *     signal-to-noise high.
 *
 * Severity:
 *   - HIGH if outstanding > ₹5L and rose > 100%
 *   - MEDIUM otherwise (still over threshold but smaller signal)
 *
 * Lookback windows: "this week" = last 7 days, "last week" =
 * 8-14 days ago. Snapshot is current outstanding (AR not yet paid).
 * "Last week's outstanding" is approximated as the same customer's
 * outstanding AS OF 7 days ago, derived from invoices issued before
 * that date minus payments made before that date.
 */

import { db } from "@/lib/db";
import type { DetectedAnomaly, DetectorFn } from "../types";
import { formatMoneyForDescription, fpKey } from "../util";

const JUMP_THRESHOLD_PCT = 50;
const MIN_ABSOLUTE_JUMP = 50_000;
const HIGH_SEVERITY_OUTSTANDING = 500_000;
const HIGH_SEVERITY_JUMP_PCT = 100;

export const detectOverdueJump: DetectorFn = async (organizationId, today) => {
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  // Current outstanding per customer.
  const currentInvoices = await db.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    select: {
      contactId: true,
      total: true,
      amountPaid: true,
      contact: { select: { displayName: true } },
    },
  });

  const currentByCustomer = new Map<string, { name: string; outstanding: number }>();
  for (const inv of currentInvoices) {
    const out = Number(inv.total) - Number(inv.amountPaid);
    if (out <= 0) continue;
    const cur = currentByCustomer.get(inv.contactId) ?? {
      name: inv.contact.displayName,
      outstanding: 0,
    };
    cur.outstanding += out;
    currentByCustomer.set(inv.contactId, cur);
  }

  // "Last week" outstanding — invoices issued ≤ weekAgo, minus
  // payments allocated to them on/before weekAgo. Approximation:
  // we use invoices issued ≤ weekAgo with their CURRENT amountPaid,
  // then add back payments that happened in the last 7 days.
  const lastWeekInvoices = await db.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"] },
      issueDate: { lte: weekAgo },
    },
    select: {
      id: true,
      contactId: true,
      total: true,
      amountPaid: true,
    },
  });
  // Pull recent payments (last 7 days) so we can subtract them
  // from amountPaid to back-derive last week's outstanding.
  const recentPayments = await db.paymentReceivedAllocation.findMany({
    where: {
      paymentReceived: {
        organizationId,
        paymentDate: { gt: weekAgo },
      },
      invoiceId: { in: lastWeekInvoices.map((i) => i.id) },
    },
    select: { invoiceId: true, amount: true },
  });
  const paidThisWeekById = new Map<string, number>();
  for (const a of recentPayments) {
    paidThisWeekById.set(
      a.invoiceId,
      (paidThisWeekById.get(a.invoiceId) ?? 0) + Number(a.amount)
    );
  }

  const lastWeekByCustomer = new Map<string, number>();
  for (const inv of lastWeekInvoices) {
    const paidThen = Number(inv.amountPaid) - (paidThisWeekById.get(inv.id) ?? 0);
    const outThen = Number(inv.total) - paidThen;
    if (outThen <= 0) continue;
    lastWeekByCustomer.set(
      inv.contactId,
      (lastWeekByCustomer.get(inv.contactId) ?? 0) + outThen
    );
  }

  const out: DetectedAnomaly[] = [];
  for (const [contactId, cur] of currentByCustomer) {
    const last = lastWeekByCustomer.get(contactId) ?? 0;
    const jump = cur.outstanding - last;
    if (jump < MIN_ABSOLUTE_JUMP) continue;
    const jumpPct = last > 0 ? (jump / last) * 100 : Infinity;
    if (jumpPct < JUMP_THRESHOLD_PCT) continue;

    const severity: "high" | "medium" =
      cur.outstanding >= HIGH_SEVERITY_OUTSTANDING && jumpPct >= HIGH_SEVERITY_JUMP_PCT
        ? "high"
        : "medium";

    out.push({
      detectorKey: "overdue_jump",
      severity,
      title: `${cur.name}'s outstanding jumped ${Math.round(jumpPct)}% week-over-week`,
      description:
        `${cur.name} owed ${formatMoneyForDescription(last, "INR")} a week ago; ` +
        `now owes ${formatMoneyForDescription(cur.outstanding, "INR")} ` +
        `(+${formatMoneyForDescription(jump, "INR")}, +${Math.round(jumpPct)}%). ` +
        `Worth checking whether new invoices went unpaid or an expected ` +
        `payment didn't land.`,
      refType: "contact",
      refId: contactId,
      fingerprint: fpKey("overdue_jump", [contactId]),
    });
  }
  return out;
};
