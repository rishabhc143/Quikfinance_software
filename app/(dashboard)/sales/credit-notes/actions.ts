"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocument } from "@/lib/sales/totals";
import {
  creditNoteSchema,
  applyCreditSchema,
  refundCreditSchema,
  type CreditNoteInput,
  type ApplyCreditInput,
  type RefundCreditInput,
} from "@/lib/validations/credit-note";

async function totalsFor(orgId: string, input: CreditNoteInput) {
  const taxes = await db.tax.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, rate: true },
  });
  const taxRate = (id?: string | null) =>
    (id ? taxes.find((t) => t.id === id)?.rate : null) ?? 0;
  return computeDocument({
    lines: input.lines.map((l) => ({
      quantity: l.quantity ?? 0,
      rate: l.rate ?? 0,
      discount: l.discount ?? 0,
      discountType: l.discountType ?? "percentage",
      taxRate: Number(taxRate(l.taxId)),
    })),
  });
}

export async function createCreditNoteAction(input: CreditNoteInput) {
  const { user, organization } = await requireOrganization();
  const data = creditNoteSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "CREDIT_NOTE");
  const totals = await totalsFor(organization.id, data);

  const created = await db.creditNote.create({
    data: {
      organizationId: organization.id,
      number,
      referenceNumber: data.referenceNumber ?? null,
      contactId: data.contactId,
      date: data.creditNoteDate,
      status: "OPEN",
      currency: data.currency,
      subTotal: totals.subTotal,
      taxAmount: totals.documentTaxAmount,
      total: totals.total,
      reason: data.reason ?? null,
      customerNotes: data.customerNotes ?? null,
      termsAndConditions: data.termsAndConditions ?? null,
      pdfTemplateId: data.pdfTemplateId ?? null,
      lineItems: {
        create: data.lines.map((l, i) => ({
          itemId: l.itemId || null,
          position: l.position ?? i,
          name: l.name,
          description: l.description ?? null,
          hsnSacCode: l.hsnSacCode ?? null,
          quantity: l.quantity,
          unit: l.unit ?? null,
          rate: l.rate,
          discount: l.discount ?? 0,
          discountType: l.discountType ?? "percentage",
          taxId: l.taxId ?? null,
          taxAmount: totals.lines[i]?.taxAmount ?? 0,
          amount: totals.lines[i]?.amount ?? 0,
        })),
      },
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "CreditNote",
    entityId: created.id,
    after: { number: created.number, total: totals.total },
  });
  revalidatePath("/sales/credit-notes");
  redirect(`/sales/credit-notes/${created.id}`);
}

export async function applyCreditNoteToInvoiceAction(
  creditNoteId: string,
  input: ApplyCreditInput
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const data = applyCreditSchema.parse(input);
  const cn = await db.creditNote.findFirst({
    where: { id: creditNoteId, organizationId: organization.id, deletedAt: null },
  });
  if (!cn) throw new Error("Credit note not found");
  const balance = Number(cn.total) - Number(cn.amountApplied) - Number(cn.amountRefunded);
  if (data.amountApplied > balance) {
    throw new Error("Amount exceeds credit balance");
  }

  await db.$transaction(async (tx) => {
    await tx.creditNoteApplication.create({
      data: {
        creditNoteId,
        invoiceId: data.invoiceId,
        amountApplied: data.amountApplied,
      },
    });
    const inv = await tx.invoice.findFirst({
      where: { id: data.invoiceId, organizationId: organization.id },
    });
    if (inv) {
      const newPaid = Number(inv.amountPaid) + data.amountApplied;
      const newStatus =
        newPaid >= Number(inv.total)
          ? "PAID"
          : newPaid > 0
          ? "PARTIALLY_PAID"
          : inv.status;
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: newPaid, status: newStatus },
      });
    }
    const newApplied = Number(cn.amountApplied) + data.amountApplied;
    const newBalance =
      Number(cn.total) - newApplied - Number(cn.amountRefunded);
    await tx.creditNote.update({
      where: { id: creditNoteId },
      data: {
        amountApplied: newApplied,
        status: newBalance <= 0.0001 ? "CLOSED" : cn.status,
      },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "CreditNoteApplication",
    entityId: creditNoteId,
    after: { invoiceId: data.invoiceId, amountApplied: data.amountApplied },
  });
  revalidatePath(`/sales/credit-notes/${creditNoteId}`);
  revalidatePath("/sales/invoices");
}

export async function refundCreditNoteAction(
  creditNoteId: string,
  input: RefundCreditInput
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const data = refundCreditSchema.parse(input);
  const cn = await db.creditNote.findFirst({
    where: { id: creditNoteId, organizationId: organization.id, deletedAt: null },
  });
  if (!cn) throw new Error("Credit note not found");
  const balance = Number(cn.total) - Number(cn.amountApplied) - Number(cn.amountRefunded);
  if (data.amount > balance) {
    throw new Error("Refund exceeds credit balance");
  }

  await db.$transaction(async (tx) => {
    await tx.creditNoteRefund.create({
      data: {
        creditNoteId,
        refundDate: data.refundDate,
        amount: data.amount,
        mode: data.mode,
        reference: data.reference ?? null,
        fromAccountId: data.fromAccountId ?? null,
        notes: data.notes ?? null,
      },
    });
    const newRefunded = Number(cn.amountRefunded) + data.amount;
    const newBalance = Number(cn.total) - Number(cn.amountApplied) - newRefunded;
    await tx.creditNote.update({
      where: { id: creditNoteId },
      data: {
        amountRefunded: newRefunded,
        status: newBalance <= 0.0001 ? "CLOSED" : cn.status,
      },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "CreditNoteRefund",
    entityId: creditNoteId,
    after: { amount: data.amount, mode: data.mode },
  });
  revalidatePath(`/sales/credit-notes/${creditNoteId}`);
}

/**
 * Reopen a Closed credit note. Per <credit_notes_spec> only valid when
 * applications/refunds have been voided so balance > 0 again.
 */
export async function reopenCreditNoteAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const cn = await db.creditNote.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!cn) throw new Error("Credit note not found");
  if (cn.status !== "CLOSED") {
    throw new Error("Only closed credit notes can be reopened");
  }
  const balance =
    Number(cn.total) - Number(cn.amountApplied) - Number(cn.amountRefunded);
  if (balance <= 0.0001) {
    throw new Error(
      "Cannot reopen — balance is zero. Void an application or refund first."
    );
  }
  await db.creditNote.update({
    where: { id },
    data: { status: "OPEN" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "CreditNote",
    entityId: id,
    after: { status: "OPEN", reopened: true },
  });
  revalidatePath(`/sales/credit-notes/${id}`);
}

export async function voidCreditNoteAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.creditNote.update({ where: { id }, data: { status: "VOID" } });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "CreditNote",
    entityId: id,
    after: { status: "VOID" },
  });
  revalidatePath(`/sales/credit-notes/${id}`);
}

export async function deleteCreditNoteAction(id: string) {
  const { user, organization } = await requireOrganization();
  const cn = await db.creditNote.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!cn) return { ok: false };
  if (Number(cn.amountApplied) > 0 || Number(cn.amountRefunded) > 0) {
    return { ok: false, error: "Credit notes with applications or refunds cannot be deleted" };
  }
  await db.creditNote.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "CreditNote",
    entityId: id,
    before: { number: cn.number },
  });
  revalidatePath("/sales/credit-notes");
  return { ok: true };
}
