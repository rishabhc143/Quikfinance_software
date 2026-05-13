import "server-only";
import type { Prisma } from "@prisma/client";
import { getOrCreateSystemAccount } from "@/lib/accounting/system-accounts";

/**
 * RPT-B Phase 1 — Post / reverse JournalEntry rows for the four
 * happy-path Sales / Purchases transitions:
 *
 *   Invoice SENT          → DR AR     CR Sales Revenue
 *   PaymentReceived alloc → DR Bank   CR AR
 *   Bill OPEN             → DR Bill Expense   CR AP
 *   PaymentMade alloc     → DR AP     CR Bank
 *
 * All helpers:
 *   - take an active Prisma transaction client (the existing $transaction
 *     in the action site) so the JE write rolls back if the action fails
 *   - are idempotent via a structured `reference` lookup
 *   - never touch auth — the caller already verified org ownership
 *
 * Reference convention (used to find + reverse JEs deterministically):
 *
 *   INV-SENT:<invoiceId>
 *   INV-PMT:<paymentReceivedId>:<invoiceId>
 *   BILL-OPEN:<billId>
 *   BILL-PMT:<paymentMadeId>:<billId>
 *
 * `reverseInvoiceJes` / `reverseBillJes` / `reversePaymentReceivedJes` /
 * `reversePaymentMadeJes` delete the JEs they find — v1 strategy.
 * Phase 2 will switch to reversing entries that preserve audit history.
 */

type Tx = Prisma.TransactionClient;

function asNumber(v: number | Prisma.Decimal): number {
  return typeof v === "number" ? v : Number(v);
}

// ───────────────────────── posts ─────────────────────────

export async function postInvoiceSentJe(
  tx: Tx,
  organizationId: string,
  invoice: {
    id: string;
    number: string;
    issueDate: Date;
    total: number | Prisma.Decimal;
  }
): Promise<void> {
  const reference = `INV-SENT:${invoice.id}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const total = asNumber(invoice.total);
  if (total === 0) return; // nothing to post

  const [ar, rev] = await Promise.all([
    getOrCreateSystemAccount(organizationId, "AR", tx),
    getOrCreateSystemAccount(organizationId, "SALES_REVENUE", tx),
  ]);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: invoice.issueDate,
      reference,
      notes: `Invoice ${invoice.number} sent`,
      lines: {
        create: [
          { accountId: ar.id, debit: total, credit: 0, description: `AR · ${invoice.number}` },
          { accountId: rev.id, debit: 0, credit: total, description: `Revenue · ${invoice.number}` },
        ],
      },
    },
  });
}

export async function postInvoicePaymentJe(
  tx: Tx,
  organizationId: string,
  paymentReceivedId: string,
  invoiceId: string,
  invoiceNumber: string,
  amount: number,
  paymentDate: Date,
  bankCoaId: string
): Promise<void> {
  if (amount <= 0) return;
  const reference = `INV-PMT:${paymentReceivedId}:${invoiceId}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const ar = await getOrCreateSystemAccount(organizationId, "AR", tx);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: paymentDate,
      reference,
      notes: `Payment received against ${invoiceNumber}`,
      lines: {
        create: [
          { accountId: bankCoaId, debit: amount, credit: 0, description: `Payment · ${invoiceNumber}` },
          { accountId: ar.id, debit: 0, credit: amount, description: `AR cleared · ${invoiceNumber}` },
        ],
      },
    },
  });
}

export async function postBillOpenJe(
  tx: Tx,
  organizationId: string,
  bill: {
    id: string;
    number: string;
    issueDate: Date;
    total: number | Prisma.Decimal;
  }
): Promise<void> {
  const reference = `BILL-OPEN:${bill.id}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const total = asNumber(bill.total);
  if (total === 0) return;

  const [ap, exp] = await Promise.all([
    getOrCreateSystemAccount(organizationId, "AP", tx),
    getOrCreateSystemAccount(organizationId, "BILL_EXPENSE", tx),
  ]);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: bill.issueDate,
      reference,
      notes: `Bill ${bill.number} opened`,
      lines: {
        create: [
          { accountId: exp.id, debit: total, credit: 0, description: `Expense · ${bill.number}` },
          { accountId: ap.id, debit: 0, credit: total, description: `AP · ${bill.number}` },
        ],
      },
    },
  });
}

export async function postBillPaymentJe(
  tx: Tx,
  organizationId: string,
  paymentMadeId: string,
  billId: string,
  billNumber: string,
  amount: number,
  paymentDate: Date,
  bankCoaId: string
): Promise<void> {
  if (amount <= 0) return;
  const reference = `BILL-PMT:${paymentMadeId}:${billId}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const ap = await getOrCreateSystemAccount(organizationId, "AP", tx);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: paymentDate,
      reference,
      notes: `Payment made against ${billNumber}`,
      lines: {
        create: [
          { accountId: ap.id, debit: amount, credit: 0, description: `AP cleared · ${billNumber}` },
          { accountId: bankCoaId, debit: 0, credit: amount, description: `Payment · ${billNumber}` },
        ],
      },
    },
  });
}

// ───────────────────────── reversals ─────────────────────────

/** Delete the INV-SENT JE for this invoice (does not touch payment JEs). */
export async function reverseInvoiceSentJe(
  tx: Tx,
  organizationId: string,
  invoiceId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: { organizationId, reference: `INV-SENT:${invoiceId}` },
  });
}

/** Delete all JEs tied to this invoice — the SENT post AND every
 *  payment allocation against it. Use this on hard-delete only. */
export async function reverseAllInvoiceJes(
  tx: Tx,
  organizationId: string,
  invoiceId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: {
      organizationId,
      OR: [
        { reference: `INV-SENT:${invoiceId}` },
        { reference: { endsWith: `:${invoiceId}` } },
      ],
    },
  });
}

export async function reverseBillOpenJe(
  tx: Tx,
  organizationId: string,
  billId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: { organizationId, reference: `BILL-OPEN:${billId}` },
  });
}

export async function reverseAllBillJes(
  tx: Tx,
  organizationId: string,
  billId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: {
      organizationId,
      OR: [
        { reference: `BILL-OPEN:${billId}` },
        { reference: { endsWith: `:${billId}` } },
      ],
    },
  });
}

/** Delete every JE this PaymentReceived created (one per allocation). */
export async function reversePaymentReceivedJes(
  tx: Tx,
  organizationId: string,
  paymentReceivedId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: {
      organizationId,
      reference: { startsWith: `INV-PMT:${paymentReceivedId}:` },
    },
  });
}

/** Delete every JE this PaymentMade created. */
export async function reversePaymentMadeJes(
  tx: Tx,
  organizationId: string,
  paymentMadeId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: {
      organizationId,
      reference: { startsWith: `BILL-PMT:${paymentMadeId}:` },
    },
  });
}

// ───────────────────────── bank-side CoA resolver ─────────────────────────

/**
 * For a payment, return the ChartOfAccount id to use as the bank-side
 * leg of the JE. Resolution order:
 *
 *   1. payment.depositToAccountId / paidThroughAccountId → must
 *      reference a CoA in this org
 *   2. payment.bankAccountId (legacy) → via BankAccount.glAccountId
 *      (lazy bridge). If the bank has no glAccountId yet, fall back
 *      to creating one inline.
 *   3. Throw — caller surfaces a "pick a posting account" error.
 */
export async function resolveBankCoaForPayment(
  tx: Tx,
  organizationId: string,
  payment: {
    depositToAccountId?: string | null;
    paidThroughAccountId?: string | null;
    bankAccountId?: string | null;
  }
): Promise<string> {
  const directId =
    payment.depositToAccountId ?? payment.paidThroughAccountId ?? null;
  if (directId) {
    const coa = await tx.chartOfAccount.findFirst({
      where: { id: directId, organizationId },
      select: { id: true },
    });
    if (!coa) {
      throw new Error(
        "Payment posting account not found in this organization."
      );
    }
    return coa.id;
  }

  if (payment.bankAccountId) {
    const bank = await tx.bankAccount.findFirst({
      where: { id: payment.bankAccountId, organizationId },
      select: { id: true, name: true, type: true, glAccountId: true },
    });
    if (!bank) throw new Error("Bank account not found in this organization.");
    if (bank.glAccountId) return bank.glAccountId;
    // Lazy-create a CoA bridge entry for this bank account, mirroring
    // the BNK-D helper but inside the existing tx.
    const coaType = bank.type === "CREDIT_CARD" ? "LIABILITY" : "ASSET";
    const namePrefix = bank.type === "CREDIT_CARD" ? "Credit Card" : "Bank";
    const code = `BNK-${bank.id.slice(-6)}`;
    let created;
    try {
      created = await tx.chartOfAccount.create({
        data: {
          organizationId,
          code,
          name: `${namePrefix}: ${bank.name}`,
          type: coaType,
          description: `Auto-created for ${bank.name}`,
        },
      });
    } catch {
      const existing = await tx.chartOfAccount.findFirst({
        where: { organizationId, code },
      });
      if (!existing) throw new Error("Could not bridge bank account to CoA");
      created = existing;
    }
    await tx.bankAccount.update({
      where: { id: bank.id },
      data: { glAccountId: created.id },
    });
    return created.id;
  }

  throw new Error(
    "Payment has no posting account — pick a deposit / paid-through account on the form."
  );
}
