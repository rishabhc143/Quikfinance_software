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
import {
  validateGLForDirection,
  assertSameDirection,
  VALID_ACCOUNT_TYPES,
  type BankLineDirection,
} from "@/lib/banking/categorise";
import { applyCategorise } from "@/lib/banking/apply-categorise";

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
    autoCreated: bankTxn.matchAutoCreated,
  };

  // BNK-D — if Categorise auto-created the linked record (Expense or
  // JournalEntry), delete it too so unmatch is symmetrical. Records
  // the user manually matched (matchAutoCreated=false) stay put.
  if (
    bankTxn.matchAutoCreated &&
    bankTxn.matchedRecordType &&
    bankTxn.matchedRecordId
  ) {
    if (bankTxn.matchedRecordType === "EXPENSE") {
      await db.expense.update({
        where: { id: bankTxn.matchedRecordId },
        data: { deletedAt: new Date() },
      });
    } else if (bankTxn.matchedRecordType === "JOURNAL_ENTRY") {
      // JournalEntry has no soft-delete column — its lines cascade-
      // delete via FK, so a hard delete is safe.
      await db.journalEntry.delete({
        where: { id: bankTxn.matchedRecordId },
      });
    }
    // Other types (INVOICE / BILL / PAYMENT_*) aren't created by
    // Categorise, so matchAutoCreated wouldn't be true. No-op.
  }

  await db.bankTransaction.update({
    where: { id: bankTxn.id },
    data: {
      matchedRecordType: null,
      matchedRecordId: null,
      matchedAt: null,
      matchedById: null,
      matchAutoCreated: false,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "BankTransaction",
    entityId: bankTxn.id,
    before,
    after: { matched: null, autoCreated: false },
  });

  revalidatePath(`/banking/accounts/${bankTxn.bankAccountId}`);
  revalidatePath(`/banking/accounts/${bankTxn.bankAccountId}/match`);
  return { ok: true };
}

/**
 * BNK-D — Categorise (no-match fallback). For a single unmatched
 * BankTransaction, create the backing record on the fly:
 *
 *   DEBIT  → new Expense pointing at the chosen expenseAccountId
 *   CREDIT → new 2-line JournalEntry (Bank GL DR + chosen Income CR)
 *
 * Then sets the existing match columns + the new matchAutoCreated
 * flag so unmatch knows to also delete the created record.
 */
export async function categoriseAction(input: {
  bankTransactionId: string;
  glAccountId: string;
  notes?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();

  const bankTxn = await db.bankTransaction.findFirst({
    where: { id: input.bankTransactionId, organizationId: organization.id },
  });
  if (!bankTxn) return { ok: false, error: "Bank transaction not found" };
  if (bankTxn.matchedRecordType) {
    return {
      ok: false,
      error: `Already matched to ${bankTxn.matchedRecordType}. Unmatch first.`,
    };
  }
  if (bankTxn.excluded) {
    return { ok: false, error: "Cannot categorise an excluded transaction." };
  }

  const gl = await db.chartOfAccount.findFirst({
    where: {
      id: input.glAccountId,
      organizationId: organization.id,
      isActive: true,
    },
  });
  if (!gl) {
    return { ok: false, error: "GL account not found in this org." };
  }

  const direction: BankLineDirection =
    bankTxn.type === "CREDIT" ? "CREDIT" : "DEBIT";
  const directionError = validateGLForDirection(direction, gl.type);
  if (directionError) return { ok: false, error: directionError };

  try {
    await applyCategorise({
      organizationId: organization.id,
      userId: user.id,
      bankTxn,
      glAccount: gl,
      notes: input.notes ?? null,
      // No ruleId — this is a user-initiated Categorise.
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Categorise failed" };
  }

  revalidatePath(`/banking/accounts/${bankTxn.bankAccountId}`);
  revalidatePath(`/banking/accounts/${bankTxn.bankAccountId}/match`);
  return { ok: true };
}

/**
 * BNK-D — Apply the same GL account to N unmatched bank lines at once.
 * All selected lines must share the same direction (server-validated)
 * so the GL pick is unambiguous. Creates one Expense or JournalEntry
 * per bank line, links each, and writes an audit row per line.
 *
 * Stops on the first per-line error and reports it. Lines processed
 * before the failure are already committed (no transaction wrapper —
 * each line is an atomic unit by itself).
 */
export async function bulkCategoriseAction(input: {
  bankTransactionIds: string[];
  glAccountId: string;
  notes?: string | null;
}): Promise<{ ok: boolean; created?: number; error?: string }> {
  const { organization } = await requireOrganization();

  if (!input.bankTransactionIds.length) {
    return { ok: false, error: "No bank lines selected." };
  }

  const txns = await db.bankTransaction.findMany({
    where: {
      id: { in: input.bankTransactionIds },
      organizationId: organization.id,
      matchedRecordType: null,
      excluded: false,
    },
    select: { id: true, type: true },
  });
  if (txns.length !== input.bankTransactionIds.length) {
    return {
      ok: false,
      error: "Some selected rows aren't eligible (already matched, excluded, or in another org).",
    };
  }

  const directionCheck = assertSameDirection(
    txns.map((t) => ({ type: t.type === "CREDIT" ? "CREDIT" : "DEBIT" }))
  );
  if ("error" in directionCheck) {
    return { ok: false, error: directionCheck.error };
  }

  // GL-type sanity check up front so we fail before doing any writes.
  const gl = await db.chartOfAccount.findFirst({
    where: {
      id: input.glAccountId,
      organizationId: organization.id,
      isActive: true,
    },
    select: { type: true },
  });
  if (!gl) return { ok: false, error: "GL account not found in this org." };
  if (!VALID_ACCOUNT_TYPES[directionCheck.direction].includes(gl.type)) {
    return {
      ok: false,
      error: validateGLForDirection(directionCheck.direction, gl.type) ?? "GL account type mismatch.",
    };
  }

  // Loop. categoriseAction already validates ownership + direction +
  // gl-type per row, so we can safely call it for each id.
  let created = 0;
  for (const txn of txns) {
    const res = await categoriseAction({
      bankTransactionId: txn.id,
      glAccountId: input.glAccountId,
      notes: input.notes ?? null,
    });
    if (!res.ok) {
      return {
        ok: false,
        created,
        error: `Stopped after ${created} row${created === 1 ? "" : "s"}: ${res.error}`,
      };
    }
    created += 1;
  }
  return { ok: true, created };
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
