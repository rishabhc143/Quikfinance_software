"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  rankCandidates,
  type Candidate,
  type CandidateRecordType,
  type BankLine,
} from "@/lib/banking/match-candidates";

/**
 * BNK-C — Server actions for the bank-line ↔ existing-record match flow.
 *
 *   listCandidatesAction   — fetch top-scored Quikfinance records to show in
 *                            the right pane next to a bank transaction.
 *   matchTransactionAction — record the match (sets matchedRecordType +
 *                            matchedRecordId on the BankTransaction row).
 *   unmatchTransactionAction — clear an existing match.
 *
 * The match itself is just data on BankTransaction — no journal entries
 * are posted from this action. Reconciliation (BNK-F) is what locks the
 * matched pair so the bank balance ↔ books balance is sealed.
 */

export type CandidateView = Candidate & { score: number };

/**
 * Pull candidates within a ±30-day window of the bank-line date, filtered
 * by money-direction. We don't try to be clever about pagination — the
 * window keeps the result set small enough to score in-memory.
 */
export async function listCandidatesAction(input: {
  bankTransactionId: string;
}): Promise<CandidateView[]> {
  const { organization } = await requireOrganization();

  const bankTxn = await db.bankTransaction.findFirst({
    where: {
      id: input.bankTransactionId,
      organizationId: organization.id,
    },
  });
  if (!bankTxn) return [];

  const bankLine: BankLine = {
    amount: Number(bankTxn.amount),
    date: bankTxn.date,
    type: bankTxn.type === "CREDIT" ? "CREDIT" : "DEBIT",
    description: bankTxn.description,
  };

  const windowStart = new Date(
    bankTxn.date.getTime() - 30 * 24 * 60 * 60 * 1000
  );
  const windowEnd = new Date(
    bankTxn.date.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  const candidates: Candidate[] = [];

  if (bankLine.type === "CREDIT") {
    // Money in: outstanding Invoices + already-recorded PaymentReceived rows.
    const [invoices, payments] = await Promise.all([
      db.invoice.findMany({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          issueDate: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          number: true,
          total: true,
          issueDate: true,
          status: true,
          contact: { select: { displayName: true } },
        },
        take: 50,
      }),
      db.paymentReceived.findMany({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          paymentDate: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          number: true,
          amount: true,
          paymentDate: true,
          contact: { select: { displayName: true } },
        },
        take: 50,
      }),
    ]);
    for (const inv of invoices) {
      candidates.push({
        type: "INVOICE",
        id: inv.id,
        number: inv.number,
        counterparty: inv.contact?.displayName ?? null,
        amount: Number(inv.total),
        date: inv.issueDate,
        status: inv.status,
      });
    }
    for (const p of payments) {
      candidates.push({
        type: "PAYMENT_RECEIVED",
        id: p.id,
        number: p.number,
        counterparty: p.contact?.displayName ?? null,
        amount: Number(p.amount),
        date: p.paymentDate,
      });
    }
  } else {
    // Money out: outstanding Bills + already-recorded PaymentMade + Expense.
    const [bills, paymentsMade, expenses] = await Promise.all([
      db.bill.findMany({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
          issueDate: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          number: true,
          total: true,
          issueDate: true,
          status: true,
          contact: { select: { displayName: true } },
        },
        take: 50,
      }),
      db.paymentMade.findMany({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          paymentDate: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          number: true,
          amount: true,
          paymentDate: true,
          contact: { select: { displayName: true } },
        },
        take: 50,
      }),
      db.expense.findMany({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          date: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          number: true,
          amount: true,
          date: true,
          contact: { select: { displayName: true } },
        },
        take: 50,
      }),
    ]);
    for (const b of bills) {
      candidates.push({
        type: "BILL",
        id: b.id,
        number: b.number,
        counterparty: b.contact?.displayName ?? null,
        amount: Number(b.total),
        date: b.issueDate,
        status: b.status,
      });
    }
    for (const p of paymentsMade) {
      candidates.push({
        type: "PAYMENT_MADE",
        id: p.id,
        number: p.number,
        counterparty: p.contact?.displayName ?? null,
        amount: Number(p.amount),
        date: p.paymentDate,
      });
    }
    for (const e of expenses) {
      candidates.push({
        type: "EXPENSE",
        id: e.id,
        number: e.number ?? `EXP-${e.id.slice(-6)}`,
        counterparty: e.contact?.displayName ?? null,
        amount: Number(e.amount),
        date: e.date,
      });
    }
  }

  return rankCandidates(bankLine, candidates);
}

export async function matchTransactionAction(input: {
  bankTransactionId: string;
  recordType: CandidateRecordType;
  recordId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();

  const bankTxn = await db.bankTransaction.findFirst({
    where: {
      id: input.bankTransactionId,
      organizationId: organization.id,
    },
  });
  if (!bankTxn) return { ok: false, error: "Bank transaction not found" };
  if (bankTxn.matchedRecordType) {
    return {
      ok: false,
      error: `Already matched to ${bankTxn.matchedRecordType}. Unmatch first.`,
    };
  }

  // Verify the target record exists + belongs to this org.
  const exists = await verifyRecordOwnership(
    organization.id,
    input.recordType,
    input.recordId
  );
  if (!exists) {
    return { ok: false, error: "Target record not found in this org" };
  }

  await db.bankTransaction.update({
    where: { id: bankTxn.id },
    data: {
      matchedRecordType: input.recordType,
      matchedRecordId: input.recordId,
      matchedAt: new Date(),
      matchedById: user.id,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "BankTransaction",
    entityId: bankTxn.id,
    after: { matched: `${input.recordType}:${input.recordId}` },
  });

  revalidatePath(`/banking/accounts/${bankTxn.bankAccountId}`);
  revalidatePath(`/banking/accounts/${bankTxn.bankAccountId}/match`);
  return { ok: true };
}

/**
 * Bind-friendly wrapper so the per-account page can do
 *   unmatchByIdAction.bind(null, txn.id)
 * and pass it to <ActionFormButton>. Throws on error so the button's
 * toast.error surfaces it (instead of returning {ok:false}).
 */
export async function unmatchByIdAction(bankTransactionId: string): Promise<void> {
  const res = await unmatchTransactionAction({ bankTransactionId });
  if (!res.ok) throw new Error(res.error ?? "Unmatch failed");
}

export async function unmatchTransactionAction(input: {
  bankTransactionId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const bankTxn = await db.bankTransaction.findFirst({
    where: {
      id: input.bankTransactionId,
      organizationId: organization.id,
    },
  });
  if (!bankTxn) return { ok: false, error: "Bank transaction not found" };
  if (!bankTxn.matchedRecordType) {
    return { ok: false, error: "Transaction isn't matched" };
  }
  if (bankTxn.isReconciled) {
    return {
      ok: false,
      error: "Transaction has been reconciled. Reverse reconciliation first.",
    };
  }

  const before = {
    matched: `${bankTxn.matchedRecordType}:${bankTxn.matchedRecordId}`,
  };

  await db.bankTransaction.update({
    where: { id: bankTxn.id },
    data: {
      matchedRecordType: null,
      matchedRecordId: null,
      matchedAt: null,
      matchedById: null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "BankTransaction",
    entityId: bankTxn.id,
    before,
    after: { matched: null },
  });

  revalidatePath(`/banking/accounts/${bankTxn.bankAccountId}`);
  revalidatePath(`/banking/accounts/${bankTxn.bankAccountId}/match`);
  return { ok: true };
}

/**
 * Confirm the target record exists + belongs to the same org. Returns
 * false (and logs a warning the caller can surface) if the record is
 * deleted / from another org / nonexistent.
 */
async function verifyRecordOwnership(
  organizationId: string,
  recordType: CandidateRecordType,
  recordId: string
): Promise<boolean> {
  const where = { id: recordId, organizationId };
  switch (recordType) {
    case "INVOICE":
      return !!(await db.invoice.findFirst({ where: { ...where, deletedAt: null }, select: { id: true } }));
    case "BILL":
      return !!(await db.bill.findFirst({ where: { ...where, deletedAt: null }, select: { id: true } }));
    case "PAYMENT_RECEIVED":
      return !!(await db.paymentReceived.findFirst({ where: { ...where, deletedAt: null }, select: { id: true } }));
    case "PAYMENT_MADE":
      return !!(await db.paymentMade.findFirst({ where: { ...where, deletedAt: null }, select: { id: true } }));
    case "EXPENSE":
      return !!(await db.expense.findFirst({ where: { ...where, deletedAt: null }, select: { id: true } }));
  }
}
