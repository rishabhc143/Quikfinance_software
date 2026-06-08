import "server-only";

/**
 * AD-v2 — Vendor concentration detector.
 *
 * Fires when a single vendor accounts for more than
 * `CONCENTRATION_THRESHOLD_PCT` (default 50%) of the org's TOTAL
 * outstanding AP (open bills), AND total AP > `MIN_TOTAL_AP`
 * (default ₹2,00,000).
 *
 * Why this matters:
 *   - Single point of failure risk — if that vendor delays
 *     delivery, demands payment terms change, or goes out of
 *     business, the org is exposed
 *   - Negotiation leverage warning — concentration tells you
 *     where you have least pricing power
 *   - GST/compliance — heavy concentration can trigger
 *     anti-profiteering review
 *
 * Severity:
 *   - HIGH if concentration > 75%
 *   - MEDIUM otherwise (50-75%)
 *
 * Triggers at most once per (org, vendor) — fingerprint includes
 * the concentrated vendor's id so a concentration that shifts
 * vendors generates a new alert.
 */

import { db } from "@/lib/db";
import type { DetectedAnomaly, DetectorFn } from "../types";
import { fpKey } from "../util";

const CONCENTRATION_THRESHOLD_PCT = 50;
const MIN_TOTAL_AP = 200_000;
const HIGH_SEVERITY_PCT = 75;

export const detectVendorConcentration: DetectorFn = async (organizationId) => {
  const openBills = await db.bill.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
    },
    select: {
      contactId: true,
      total: true,
      amountPaid: true,
      contact: { select: { displayName: true } },
    },
  });

  const byVendor = new Map<string, { name: string; outstanding: number }>();
  let totalAp = 0;
  for (const bill of openBills) {
    if (!bill.contactId) continue;
    const out = Number(bill.total) - Number(bill.amountPaid);
    if (out <= 0) continue;
    totalAp += out;
    const cur = byVendor.get(bill.contactId) ?? {
      name: bill.contact?.displayName ?? "Unknown vendor",
      outstanding: 0,
    };
    cur.outstanding += out;
    byVendor.set(bill.contactId, cur);
  }

  if (totalAp < MIN_TOTAL_AP) return [];

  const out: DetectedAnomaly[] = [];
  for (const [vendorId, vendor] of byVendor) {
    const pct = (vendor.outstanding / totalAp) * 100;
    if (pct < CONCENTRATION_THRESHOLD_PCT) continue;
    const severity: "high" | "medium" =
      pct >= HIGH_SEVERITY_PCT ? "high" : "medium";

    out.push({
      detectorKey: "vendor_concentration",
      severity,
      title: `${vendor.name} accounts for ${Math.round(pct)}% of your payables`,
      description:
        `You owe ${vendor.name} ${formatINR(vendor.outstanding)} out of ` +
        `${formatINR(totalAp)} total payables (${Math.round(pct)}%). ` +
        `Single-vendor concentration above ${CONCENTRATION_THRESHOLD_PCT}% is ` +
        `a supply-chain risk — if they delay or hike prices you have ` +
        `limited negotiation room. Consider diversifying for non-strategic spend.`,
      refType: "contact",
      refId: vendorId,
      fingerprint: fpKey("vendor_concentration", [vendorId]),
    });
  }
  return out;
};

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
