import "server-only";

/**
 * CF-7 — Detect possible duplicate bills.
 *
 * Heuristic: two non-deleted bills from the same vendor with the
 * same total amount, issued within 7 days of each other, and both
 * still unpaid (status OPEN / PARTIALLY_PAID / OVERDUE). This is
 * the classic accidental-double-entry pattern.
 *
 * Why not also flag once one is paid? Because at that point the
 * user has implicitly accepted both as legitimate. We don't want
 * to alarm them after the fact — the goal is to catch the
 * duplicate BEFORE money goes out.
 */

import { db } from "@/lib/db";
import type { DetectedAnomaly, DetectorFn } from "../types";
import { formatMoneyForDescription, fpKey } from "../util";

const DUPLICATE_WINDOW_DAYS = 7;

export const detectDuplicateBills: DetectorFn = async (organizationId) => {
  const bills = await db.bill.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
    },
    select: {
      id: true,
      number: true,
      contactId: true,
      issueDate: true,
      total: true,
      currency: true,
      contact: { select: { displayName: true } },
    },
    orderBy: { issueDate: "asc" },
  });

  const out: DetectedAnomaly[] = [];

  // Group by (contactId, total) for an O(N) sweep. Within each
  // group we look for adjacent-by-issueDate pairs within the
  // 7-day window.
  type Key = string; // `${contactId}|${total.toFixed(4)}`
  const groups = new Map<Key, typeof bills>();
  for (const b of bills) {
    if (!b.contactId) continue; // bills without a vendor can't be duplicates
    const key: Key = `${b.contactId}|${Number(b.total).toFixed(4)}`;
    const arr = groups.get(key) ?? [];
    arr.push(b);
    groups.set(key, arr);
  }

  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length - 1; i += 1) {
      const a = arr[i];
      const b = arr[i + 1];
      const days = Math.abs(
        (b.issueDate.getTime() - a.issueDate.getTime()) / 86400000
      );
      if (days > DUPLICATE_WINDOW_DAYS) continue;
      const sortedIds = [a.id, b.id].sort();
      out.push({
        detectorKey: "duplicate_bill",
        severity: "high",
        title: `Possible duplicate bill from ${a.contact?.displayName ?? "vendor"}`,
        description:
          `Two open bills with the same amount of ${formatMoneyForDescription(
            Number(a.total),
            a.currency ?? "INR"
          )} were issued ${Math.round(days)} day${days === 1 ? "" : "s"} apart: ` +
          `${a.number} (${a.issueDate.toISOString().slice(0, 10)}) and ` +
          `${b.number} (${b.issueDate.toISOString().slice(0, 10)}). ` +
          `Review both before paying — one may have been entered twice.`,
        refType: "bill",
        refId: b.id,
        fingerprint: fpKey("duplicate_bill", sortedIds),
      });
    }
  }

  return out;
};
