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

// ───────────────────────── RPT-B Phase 2 posts ─────────────────────────

/**
 * Sales Credit Note creation (OPEN). Reduces AR by the credit-note
 * total — i.e. "we owe the customer this much" — and posts the
 * reduction to a contra-revenue Sales Returns expense account.
 *
 *   DR Sales Returns:       <total>
 *   CR Accounts Receivable: <total>
 */
export async function postCreditNoteOpenJe(
  tx: Tx,
  organizationId: string,
  creditNote: {
    id: string;
    number: string;
    date: Date;
    total: number | Prisma.Decimal;
  }
): Promise<void> {
  const reference = `CN-OPEN:${creditNote.id}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const total = asNumber(creditNote.total);
  if (total === 0) return;

  const [sr, ar] = await Promise.all([
    getOrCreateSystemAccount(organizationId, "SALES_RETURNS", tx),
    getOrCreateSystemAccount(organizationId, "AR", tx),
  ]);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: creditNote.date,
      reference,
      notes: `Credit note ${creditNote.number} opened`,
      lines: {
        create: [
          { accountId: sr.id, debit: total, credit: 0, description: `Sales returns · ${creditNote.number}` },
          { accountId: ar.id, debit: 0, credit: total, description: `AR offset · ${creditNote.number}` },
        ],
      },
    },
  });
}

/**
 * Vendor Credit creation (OPEN). Mirror of credit notes for the
 * purchases side.
 *
 *   DR Accounts Payable:    <total>
 *   CR Purchase Returns:    <total>
 */
export async function postVendorCreditOpenJe(
  tx: Tx,
  organizationId: string,
  vendorCredit: {
    id: string;
    number: string;
    date: Date;
    total: number | Prisma.Decimal;
  }
): Promise<void> {
  const reference = `VC-OPEN:${vendorCredit.id}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const total = asNumber(vendorCredit.total);
  if (total === 0) return;

  const [ap, pr] = await Promise.all([
    getOrCreateSystemAccount(organizationId, "AP", tx),
    getOrCreateSystemAccount(organizationId, "PURCHASE_RETURNS", tx),
  ]);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: vendorCredit.date,
      reference,
      notes: `Vendor credit ${vendorCredit.number} opened`,
      lines: {
        create: [
          { accountId: ap.id, debit: total, credit: 0, description: `AP offset · ${vendorCredit.number}` },
          { accountId: pr.id, debit: 0, credit: total, description: `Purchase returns · ${vendorCredit.number}` },
        ],
      },
    },
  });
}

/**
 * Invoice write-off. The user has decided this AR isn't collectible —
 * post a Bad Debt Expense for the unpaid portion and clear the AR.
 *
 *   DR Bad Debt Expense:     <writeOffAmount>
 *   CR Accounts Receivable:  <writeOffAmount>
 */
export async function postInvoiceWriteOffJe(
  tx: Tx,
  organizationId: string,
  invoice: { id: string; number: string; issueDate: Date },
  writeOffAmount: number
): Promise<void> {
  if (writeOffAmount <= 0) return;
  const reference = `INV-WRITEOFF:${invoice.id}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const [bad, ar] = await Promise.all([
    getOrCreateSystemAccount(organizationId, "BAD_DEBT_EXPENSE", tx),
    getOrCreateSystemAccount(organizationId, "AR", tx),
  ]);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: invoice.issueDate,
      reference,
      notes: `Wrote off ${invoice.number}`,
      lines: {
        create: [
          { accountId: bad.id, debit: writeOffAmount, credit: 0, description: `Bad debt · ${invoice.number}` },
          { accountId: ar.id, debit: 0, credit: writeOffAmount, description: `AR cleared · ${invoice.number}` },
        ],
      },
    },
  });
}

/**
 * Bill write-off. The vendor effectively forgave us the remaining
 * balance — book the unpaid portion as Bad Debt Recovery income and
 * clear the AP.
 *
 *   DR Accounts Payable:     <writeOffAmount>
 *   CR Bad Debt Recovery:    <writeOffAmount>
 */
export async function postBillWriteOffJe(
  tx: Tx,
  organizationId: string,
  bill: { id: string; number: string; issueDate: Date },
  writeOffAmount: number
): Promise<void> {
  if (writeOffAmount <= 0) return;
  const reference = `BILL-WRITEOFF:${bill.id}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const [ap, recov] = await Promise.all([
    getOrCreateSystemAccount(organizationId, "AP", tx),
    getOrCreateSystemAccount(organizationId, "BAD_DEBT_RECOVERY", tx),
  ]);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: bill.issueDate,
      reference,
      notes: `Wrote off ${bill.number}`,
      lines: {
        create: [
          { accountId: ap.id, debit: writeOffAmount, credit: 0, description: `AP cleared · ${bill.number}` },
          { accountId: recov.id, debit: 0, credit: writeOffAmount, description: `Recovery · ${bill.number}` },
        ],
      },
    },
  });
}

// ───────────────────────── RPT-B Phase 3 posts ─────────────────────────

/**
 * Customer credit note refund — we pay the customer back the credit
 * balance in cash. Counterbalances the original CN-OPEN entry's
 * CR-AR leg by debiting AR back, while cash leaves the bank.
 *
 *   DR Accounts Receivable: <refundAmount>
 *   CR Bank:                <refundAmount>
 */
export async function postCreditNoteRefundJe(
  tx: Tx,
  organizationId: string,
  creditNoteId: string,
  refundId: string,
  creditNoteNumber: string,
  amount: number,
  refundDate: Date,
  bankCoaId: string
): Promise<void> {
  if (amount <= 0) return;
  // Reference key includes the parent CN id so `reverseCreditNoteJes`
  // can find every refund under one startsWith query.
  const reference = `CN-REFUND:${creditNoteId}:${refundId}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const ar = await getOrCreateSystemAccount(organizationId, "AR", tx);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: refundDate,
      reference,
      notes: `Refund of ${creditNoteNumber}`,
      lines: {
        create: [
          { accountId: ar.id, debit: amount, credit: 0, description: `AR refund · ${creditNoteNumber}` },
          { accountId: bankCoaId, debit: 0, credit: amount, description: `Cash out · ${creditNoteNumber}` },
        ],
      },
    },
  });
}

/**
 * Vendor credit refund — the vendor pays us back. Counterbalances
 * the original VC-OPEN's DR-AP leg.
 *
 *   DR Bank:                <refundAmount>
 *   CR Accounts Payable:    <refundAmount>
 */
export async function postVendorCreditRefundJe(
  tx: Tx,
  organizationId: string,
  vendorCreditId: string,
  refundId: string,
  vendorCreditNumber: string,
  amount: number,
  refundDate: Date,
  bankCoaId: string
): Promise<void> {
  if (amount <= 0) return;
  const reference = `VC-REFUND:${vendorCreditId}:${refundId}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const ap = await getOrCreateSystemAccount(organizationId, "AP", tx);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: refundDate,
      reference,
      notes: `Refund received for ${vendorCreditNumber}`,
      lines: {
        create: [
          { accountId: bankCoaId, debit: amount, credit: 0, description: `Cash in · ${vendorCreditNumber}` },
          { accountId: ap.id, debit: 0, credit: amount, description: `AP refund · ${vendorCreditNumber}` },
        ],
      },
    },
  });
}

/**
 * Vendor advance creation — cash leaves now to prepay a vendor; the
 * advance sits as an asset until drawn against a future bill.
 *
 *   DR Vendor Advances:     <amount>
 *   CR Bank:                <amount>
 */
export async function postVendorAdvanceCreateJe(
  tx: Tx,
  organizationId: string,
  paymentMade: {
    id: string;
    number: string;
    paymentDate: Date;
    amount: number | Prisma.Decimal;
  },
  bankCoaId: string
): Promise<void> {
  const reference = `VA-CREATE:${paymentMade.id}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const amount = asNumber(paymentMade.amount);
  if (amount === 0) return;

  const va = await getOrCreateSystemAccount(organizationId, "VENDOR_ADVANCES", tx);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: paymentMade.paymentDate,
      reference,
      notes: `Vendor advance ${paymentMade.number}`,
      lines: {
        create: [
          { accountId: va.id, debit: amount, credit: 0, description: `Advance · ${paymentMade.number}` },
          { accountId: bankCoaId, debit: 0, credit: amount, description: `Cash out · ${paymentMade.number}` },
        ],
      },
    },
  });
}

/**
 * Vendor advance draw-down — apply prepaid money to settle a bill.
 * Bank balance is NOT touched (cash already left at advance time);
 * the asset is consumed to clear AP.
 *
 *   DR Accounts Payable:    <allocAmount>
 *   CR Vendor Advances:     <allocAmount>
 *
 * Distinct reference prefix `BILL-PMT-ADV` keeps these JEs separate
 * from the cash-side `BILL-PMT` posts so reversal queries don't
 * cross-match.
 */
export async function postVendorAdvanceApplicationJe(
  tx: Tx,
  organizationId: string,
  paymentMadeId: string,
  billId: string,
  billNumber: string,
  amount: number,
  paymentDate: Date
): Promise<void> {
  if (amount <= 0) return;
  const reference = `BILL-PMT-ADV:${paymentMadeId}:${billId}`;
  const existing = await tx.journalEntry.findFirst({
    where: { organizationId, reference },
    select: { id: true },
  });
  if (existing) return;

  const [ap, va] = await Promise.all([
    getOrCreateSystemAccount(organizationId, "AP", tx),
    getOrCreateSystemAccount(organizationId, "VENDOR_ADVANCES", tx),
  ]);

  await tx.journalEntry.create({
    data: {
      organizationId,
      date: paymentDate,
      reference,
      notes: `Advance applied to ${billNumber}`,
      lines: {
        create: [
          { accountId: ap.id, debit: amount, credit: 0, description: `AP cleared · ${billNumber}` },
          { accountId: va.id, debit: 0, credit: amount, description: `Advance drawn · ${billNumber}` },
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

/**
 * Delete every JE this PaymentMade created — cash-side bill payments
 * (`BILL-PMT:`), advance-source draws (`BILL-PMT-ADV:`), and the
 * advance-creation row (`VA-CREATE:`).
 */
export async function reversePaymentMadeJes(
  tx: Tx,
  organizationId: string,
  paymentMadeId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: {
      organizationId,
      OR: [
        { reference: { startsWith: `BILL-PMT:${paymentMadeId}:` } },
        { reference: { startsWith: `BILL-PMT-ADV:${paymentMadeId}:` } },
        { reference: `VA-CREATE:${paymentMadeId}` },
      ],
    },
  });
}

// ───────────────────────── RPT-B Phase 2 reversals ─────────────────────────

/**
 * Delete every JE tied to a sales credit note — the OPEN posting and
 * every refund tagged under it (`CN-REFUND:<cnId>:*`).
 */
export async function reverseCreditNoteJes(
  tx: Tx,
  organizationId: string,
  creditNoteId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: {
      organizationId,
      OR: [
        { reference: `CN-OPEN:${creditNoteId}` },
        { reference: { startsWith: `CN-REFUND:${creditNoteId}:` } },
      ],
    },
  });
}

/**
 * Delete every JE tied to a vendor credit — the OPEN posting and
 * every refund tagged under it (`VC-REFUND:<vcId>:*`).
 */
export async function reverseVendorCreditJes(
  tx: Tx,
  organizationId: string,
  vendorCreditId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: {
      organizationId,
      OR: [
        { reference: `VC-OPEN:${vendorCreditId}` },
        { reference: { startsWith: `VC-REFUND:${vendorCreditId}:` } },
      ],
    },
  });
}

/** Delete the INV-WRITEOFF JE for an invoice. */
export async function reverseInvoiceWriteOffJe(
  tx: Tx,
  organizationId: string,
  invoiceId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: { organizationId, reference: `INV-WRITEOFF:${invoiceId}` },
  });
}

/** Delete the BILL-WRITEOFF JE for a bill. */
export async function reverseBillWriteOffJe(
  tx: Tx,
  organizationId: string,
  billId: string
): Promise<void> {
  await tx.journalEntry.deleteMany({
    where: { organizationId, reference: `BILL-WRITEOFF:${billId}` },
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
 *      (lazy bridge)
 *   3. Lazy-create + post to the `SYS-CASH` (Cash on Hand) fallback
 *      account. Lets the action succeed even when the user hasn't
 *      configured a bank account yet; books still balance.
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

  // Fallback — the org hasn't configured any bank or deposit-to account.
  // Post to a system "Cash on Hand" asset so the books still balance.
  const cash = await (
    await import("@/lib/accounting/system-accounts")
  ).getOrCreateSystemAccount(organizationId, "CASH_ON_HAND", tx);
  return cash.id;
}
