/**
 * DOC-D4.3: Match parsed bank statement rows to outstanding Invoices / Bills.
 *
 * Bank statement shows a credit of ₹50,000 on May 5? Probably the
 * customer paying Invoice INV-001. Statement shows a debit of
 * ₹15,000? Probably your bill to Vendor X.
 *
 * This helper does the matching read-only — surfaces suggestions in
 * the drawer so users can deep-link to the invoice/bill detail page
 * to record the payment. v1 doesn't auto-create payments (more
 * surface area, more failure modes).
 *
 * Matching rules:
 *   - Amount within ±₹1 OR ±2% (whichever is larger)
 *   - Entity's issueDate within 60 days BEFORE the row's date
 *     (payments arrive after the bill is issued)
 *   - Entity status excludes PAID / VOID / WRITTEN_OFF / DRAFT
 *   - One best-confidence match per row (no aggregates in v1)
 *
 * Confidence scoring:
 *   - 100: amount exact + date within 30 days
 *   - 80:  amount exact + date 30-60 days
 *   - 60:  amount close (1-2%) + date within 30 days
 *   - 40:  amount close + date 30-60 days
 */

import { db } from "@/lib/db";

export type BankRowForMatching = {
  /** ISO date string yyyy-MM-dd */
  date: string;
  /** Positive number when row is a credit (incoming payment) */
  credit?: number | null;
  /** Positive number when row is a debit (outgoing payment) */
  debit?: number | null;
  description: string;
};

export type SuggestedMatchEntity = {
  id: string;
  /** Display number e.g. "INV-001" / "BILL-005" */
  number: string;
  /** Customer (for invoices) or vendor (for bills) display name */
  counterpartyName: string;
  /** Total amount of the invoice / bill */
  total: number;
  /** Amount already paid */
  amountPaid: number;
  /** Outstanding balance (total - amountPaid) */
  outstandingAmount: number;
  /** yyyy-MM-dd */
  issueDate: string;
  /** yyyy-MM-dd */
  dueDate: string;
  status: string;
};

export type SuggestedMatch = {
  rowIndex: number;
  rowKind: "credit" | "debit";
  rowAmount: number;
  rowDate: string;
  rowDescription: string;
  /** "INVOICE" for credits, "BILL" for debits */
  entityType: "INVOICE" | "BILL";
  entity: SuggestedMatchEntity;
  /** 0-100, higher = stronger match */
  confidence: number;
  /** Human-readable explanation for the tooltip */
  reason: string;
};

const AMOUNT_TOLERANCE_RUPEES = 1;
const AMOUNT_TOLERANCE_PCT = 0.02; // 2%
const DATE_LOOKBACK_DAYS = 60;
const HIGH_CONFIDENCE_DATE_DAYS = 30;

function withinTolerance(rowAmount: number, outstanding: number): "exact" | "close" | "no" {
  const diff = Math.abs(rowAmount - outstanding);
  if (diff <= AMOUNT_TOLERANCE_RUPEES) return "exact";
  const pctDiff = diff / outstanding;
  if (pctDiff <= AMOUNT_TOLERANCE_PCT) return "close";
  return "no";
}

function dateDiffDays(rowDate: string, issueDate: string): number {
  const a = new Date(rowDate).getTime();
  const b = new Date(issueDate).getTime();
  if (isNaN(a) || isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function scoreMatch(
  amountMatch: "exact" | "close",
  dateDays: number
): { confidence: number; reason: string } {
  if (amountMatch === "exact" && dateDays <= HIGH_CONFIDENCE_DATE_DAYS) {
    return {
      confidence: 100,
      reason: `Exact amount match · invoice issued ${dateDays} days before payment`,
    };
  }
  if (amountMatch === "exact") {
    return {
      confidence: 80,
      reason: `Exact amount match · invoice issued ${dateDays} days before payment`,
    };
  }
  if (amountMatch === "close" && dateDays <= HIGH_CONFIDENCE_DATE_DAYS) {
    return {
      confidence: 60,
      reason: `Close amount match (within 2%) · ${dateDays} days difference`,
    };
  }
  return {
    confidence: 40,
    reason: `Close amount match · ${dateDays} days difference`,
  };
}

/**
 * Main entry point. Returns one best-confidence match per row (or
 * nothing for rows that don't match anything outstanding).
 *
 * Reads the org's open invoices + bills once each so we don't make
 * N queries for N rows.
 */
export async function suggestMatchesForBankRows({
  organizationId,
  rows,
}: {
  organizationId: string;
  rows: BankRowForMatching[];
}): Promise<SuggestedMatch[]> {
  if (rows.length === 0) return [];

  // Compute the earliest date we'd consider (rows span - lookback)
  const earliestRowDate = rows
    .map((r) => new Date(r.date).getTime())
    .filter((t) => !isNaN(t))
    .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  const earliestIssueDate = new Date(
    earliestRowDate - DATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  // Load outstanding invoices (for credit rows).
  const invoices = await db.invoice.findMany({
    where: {
      organizationId,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      issueDate: { gte: earliestIssueDate },
    },
    select: {
      id: true,
      number: true,
      total: true,
      amountPaid: true,
      issueDate: true,
      dueDate: true,
      status: true,
      contact: { select: { displayName: true } },
    },
  });

  // Load outstanding bills (for debit rows).
  const bills = await db.bill.findMany({
    where: {
      organizationId,
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
      issueDate: { gte: earliestIssueDate },
    },
    select: {
      id: true,
      number: true,
      total: true,
      amountPaid: true,
      issueDate: true,
      dueDate: true,
      status: true,
      contact: { select: { displayName: true } },
    },
  });

  const matches: SuggestedMatch[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowDateTs = new Date(row.date).getTime();
    if (isNaN(rowDateTs)) continue;

    const isCredit = typeof row.credit === "number" && row.credit > 0;
    const isDebit = typeof row.debit === "number" && row.debit > 0;
    if (!isCredit && !isDebit) continue;

    const rowAmount = isCredit ? (row.credit as number) : (row.debit as number);
    const candidates = isCredit ? invoices : bills;

    let bestMatch: SuggestedMatch | null = null;

    for (const c of candidates) {
      const total = Number(c.total);
      const paid = Number(c.amountPaid);
      const outstanding = total - paid;
      if (outstanding <= 0) continue;

      const amountMatch = withinTolerance(rowAmount, outstanding);
      if (amountMatch === "no") continue;

      const issueDateIso = c.issueDate.toISOString().slice(0, 10);
      const dateDays = dateDiffDays(row.date, issueDateIso);
      // Skip if invoice/bill was issued AFTER the bank row (negative
      // days) or further back than the lookback window.
      if (dateDays < 0 || dateDays > DATE_LOOKBACK_DAYS) continue;

      const { confidence, reason } = scoreMatch(amountMatch, dateDays);

      const candidate: SuggestedMatch = {
        rowIndex: i,
        rowKind: isCredit ? "credit" : "debit",
        rowAmount,
        rowDate: row.date,
        rowDescription: row.description,
        entityType: isCredit ? "INVOICE" : "BILL",
        entity: {
          id: c.id,
          number: c.number,
          counterpartyName: c.contact?.displayName ?? "Unknown",
          total,
          amountPaid: paid,
          outstandingAmount: outstanding,
          issueDate: issueDateIso,
          dueDate: c.dueDate.toISOString().slice(0, 10),
          status: c.status,
        },
        confidence,
        reason,
      };

      if (!bestMatch || candidate.confidence > bestMatch.confidence) {
        bestMatch = candidate;
      }
    }

    if (bestMatch) matches.push(bestMatch);
  }

  return matches;
}
