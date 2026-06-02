"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocumentTotals } from "@/lib/sales/document-totals";
import {
  debitNoteSchema,
  type DebitNoteInput,
} from "@/lib/validations/debit-note";

/**
 * M23: Debit Note CRUD server actions. Mirrors the Credit Note shape
 * (totals computed server-side, line-items wholesale-replaced on
 * update, soft-delete only). Debit Notes increase the customer's
 * receivable — the application against an invoice flow is a follow-up
 * (M17a scaffolded the model; this batch ships create/edit/delete +
 * UI but defers the apply-to-invoice action since it inverts the
 * receivable rather than reduces it).
 */

export async function createDebitNoteAction(input: DebitNoteInput) {
  const { user, organization } = await requireOrganization();
  const data = debitNoteSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "DEBIT_NOTE");
  const totals = await computeDocumentTotals(organization.id, data);

  const created = await db.debitNote.create({
    data: {
      organizationId: organization.id,
      debitNoteNumber: number,
      referenceNumber: data.referenceNumber ?? null,
      contactId: data.contactId,
      debitNoteDate: data.debitNoteDate,
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

  // M25: persist custom field values
  if (data.customFieldValues && data.customFieldValues.length > 0) {
    await db.customFieldValue.createMany({
      data: data.customFieldValues.map((v) => ({
        organizationId: organization.id,
        entityType: "DEBIT_NOTE",
        entityId: created.id,
        fieldDefinitionId: v.fieldDefinitionId,
        value: v.value as object,
      })),
      skipDuplicates: true,
    });
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "DebitNote",
    entityId: created.id,
    after: { number: created.debitNoteNumber, total: totals.total },
  });
  revalidatePath("/sales/debit-notes");
  redirect(`/sales/debit-notes/${created.id}`);
}

export async function updateDebitNoteAction(id: string, input: DebitNoteInput) {
  const { user, organization } = await requireOrganization();
  const data = debitNoteSchema.parse(input);
  const before = await db.debitNote.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Debit note not found");
  if (before.status === "VOID") {
    throw new Error("Void debit notes cannot be edited");
  }
  if (Number(before.amountApplied) > 0) {
    throw new Error("Debit notes with applications cannot be edited");
  }
  const totals = await computeDocumentTotals(organization.id, data);

  await db.$transaction(async (tx) => {
    await tx.debitNoteLineItem.deleteMany({ where: { debitNoteId: id } });
    await tx.debitNote.update({
      where: { id },
      data: {
        referenceNumber: data.referenceNumber ?? null,
        contactId: data.contactId,
        debitNoteDate: data.debitNoteDate,
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
    // M25: replace custom field values wholesale
    await tx.customFieldValue.deleteMany({
      where: {
        organizationId: organization.id,
        entityType: "DEBIT_NOTE",
        entityId: id,
      },
    });
    if (data.customFieldValues && data.customFieldValues.length > 0) {
      await tx.customFieldValue.createMany({
        data: data.customFieldValues.map((v) => ({
          organizationId: organization.id,
          entityType: "DEBIT_NOTE",
          entityId: id,
          fieldDefinitionId: v.fieldDefinitionId,
          value: v.value as object,
        })),
        skipDuplicates: true,
      });
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DebitNote",
    entityId: id,
    before: { total: before.total.toString() },
    after: { total: totals.total },
  });
  revalidatePath("/sales/debit-notes");
  revalidatePath(`/sales/debit-notes/${id}`);
  redirect(`/sales/debit-notes/${id}`);
}

export async function softDeleteDebitNoteAction(id: string) {
  const { user, organization } = await requireOrganization();
  const dn = await db.debitNote.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!dn) return { ok: false, error: "Debit note not found" };
  if (Number(dn.amountApplied) > 0) {
    return { ok: false, error: "Debit notes with applications cannot be deleted" };
  }
  await db.debitNote.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "DebitNote",
    entityId: id,
    before: { number: dn.debitNoteNumber },
  });
  revalidatePath("/sales/debit-notes");
  return { ok: true };
}

export async function voidDebitNoteAction(id: string) {
  const { user, organization } = await requireOrganization();
  const dn = await db.debitNote.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!dn) throw new Error("Debit note not found");
  await db.debitNote.update({
    where: { id },
    data: { status: "VOID" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DebitNote",
    entityId: id,
    after: { status: "VOID" },
  });
  revalidatePath("/sales/debit-notes");
  revalidatePath(`/sales/debit-notes/${id}`);
}

/**
 * M26: bulk actions on the Debit Notes list page.
 * Mirrors the M15-shipped pattern for other modules.
 */
export async function bulkVoidDebitNotesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.debitNote.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: { not: "VOID" },
    },
    data: { status: "VOID" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DebitNote",
    entityId: `bulk-${Date.now()}`,
    after: { status: "VOID", count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/debit-notes");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteDebitNotesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Block delete on debit notes that have applications already
  const blocked = await db.debitNote.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      amountApplied: { gt: 0 },
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} debit note${blocked === 1 ? "" : "s"} with applications cannot be deleted`,
    };
  }
  const result = await db.debitNote.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "DebitNote",
    entityId: `bulk-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/debit-notes");
  return { ok: true, updated: result.count };
}
