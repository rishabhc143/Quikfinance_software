"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { computeDocument } from "@/lib/sales/totals";
import { generateRecurringOccurrence, computeNextOccurrence } from "@/lib/sales/recurring";
import {
  recurringInvoiceSchema,
  type RecurringInvoiceInput,
} from "@/lib/validations/recurring-invoice";

async function buildTemplate(orgId: string, input: RecurringInvoiceInput) {
  const taxes = await db.tax.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, rate: true },
  });
  const taxRate = (id?: string | null) =>
    (id ? taxes.find((t) => t.id === id)?.rate : null) ?? 0;
  const totals = computeDocument({
    lines: input.lines.map((l) => ({
      quantity: l.quantity ?? 0,
      rate: l.rate ?? 0,
      discount: l.discount ?? 0,
      discountType: l.discountType ?? "percentage",
      taxRate: Number(taxRate(l.taxId)),
    })),
    documentDiscount: input.documentDiscount
      ? {
          value: input.documentDiscount.value ?? 0,
          type: input.documentDiscount.type ?? "percentage",
        }
      : undefined,
    adjustment: input.adjustmentValue ?? 0,
  });
  return {
    orderNumber: input.orderNumber ?? null,
    paymentTermsId: input.paymentTermsId ?? null,
    salespersonId: input.salespersonId ?? null,
    currency: input.currency,
    subTotal: Number(totals.subTotal),
    discountValue: input.documentDiscount?.value ?? 0,
    discountType: input.documentDiscount?.type ?? "percentage",
    taxAmount: Number(totals.documentTaxAmount),
    adjustmentLabel: input.adjustmentLabel ?? "Adjustment",
    adjustmentValue: input.adjustmentValue ?? 0,
    total: Number(totals.total),
    customerNotes: input.customerNotes ?? null,
    termsAndConditions: input.termsAndConditions ?? null,
    lines: input.lines.map((l, i) => ({
      itemId: l.itemId ?? null,
      position: l.position ?? i,
      name: l.name,
      description: l.description ?? null,
      hsnSacCode: l.hsnSacCode ?? null,
      quantity: Number(l.quantity ?? 0),
      unit: l.unit ?? null,
      rate: Number(l.rate ?? 0),
      discount: Number(l.discount ?? 0),
      discountType: l.discountType ?? "percentage",
      taxId: l.taxId ?? null,
      taxAmount: Number(totals.lines[i]?.taxAmount ?? 0),
      amount: Number(totals.lines[i]?.amount ?? 0),
    })),
  };
}

export async function createRecurringInvoiceAction(input: RecurringInvoiceInput) {
  const { user, organization } = await requireOrganization();
  const data = recurringInvoiceSchema.parse(input);
  const template = await buildTemplate(organization.id, data);
  const next = data.startDate;
  const created = await db.recurringInvoice.create({
    data: {
      organizationId: organization.id,
      profileName: data.profileName,
      contactId: data.contactId,
      frequency: data.frequency,
      intervalN: data.intervalN,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      neverExpires: data.neverExpires,
      nextOccurrenceDate: next,
      nextRunAt: next,
      emailAutomatically: data.emailAutomatically,
      status: "ACTIVE",
      isActive: true,
      amount: template.total,
      templateJson: template,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "RecurringInvoice",
    entityId: created.id,
    after: { profileName: created.profileName, frequency: created.frequency },
  });
  revalidatePath("/sales/recurring-invoices");
  redirect(`/sales/recurring-invoices/${created.id}`);
}

export async function updateRecurringInvoiceAction(
  id: string,
  input: RecurringInvoiceInput
) {
  const { user, organization } = await requireOrganization();
  const data = recurringInvoiceSchema.parse(input);
  const template = await buildTemplate(organization.id, data);
  await db.recurringInvoice.update({
    where: { id },
    data: {
      profileName: data.profileName,
      contactId: data.contactId,
      frequency: data.frequency,
      intervalN: data.intervalN,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      neverExpires: data.neverExpires,
      emailAutomatically: data.emailAutomatically,
      amount: template.total,
      templateJson: template,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringInvoice",
    entityId: id,
    after: { profileName: data.profileName },
  });
  revalidatePath("/sales/recurring-invoices");
  revalidatePath(`/sales/recurring-invoices/${id}`);
  redirect(`/sales/recurring-invoices/${id}`);
}

export async function pauseRecurringInvoiceAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringInvoice.update({
    where: { id },
    data: { status: "PAUSED", isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringInvoice",
    entityId: id,
    after: { status: "PAUSED" },
  });
  revalidatePath("/sales/recurring-invoices");
  revalidatePath(`/sales/recurring-invoices/${id}`);
}

export async function resumeRecurringInvoiceAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringInvoice.update({
    where: { id },
    data: { status: "ACTIVE", isActive: true },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringInvoice",
    entityId: id,
    after: { status: "ACTIVE" },
  });
  revalidatePath("/sales/recurring-invoices");
  revalidatePath(`/sales/recurring-invoices/${id}`);
}

export async function stopRecurringInvoiceAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringInvoice.update({
    where: { id },
    data: { status: "STOPPED", isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringInvoice",
    entityId: id,
    after: { status: "STOPPED" },
  });
  revalidatePath("/sales/recurring-invoices");
}

export async function runRecurringNowAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = await generateRecurringOccurrence(id, today);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "RecurringInvoice",
    entityId: id,
    after: { manualRun: true, generatedInvoiceId: out.invoiceId, reason: out.reason },
  });
  revalidatePath(`/sales/recurring-invoices/${id}`);
  revalidatePath("/sales/invoices");
}

export async function deleteRecurringInvoiceAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.recurringInvoice.update({
    where: { id },
    data: { deletedAt: new Date(), status: "STOPPED", isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "RecurringInvoice",
    entityId: id,
  });
  revalidatePath("/sales/recurring-invoices");
  return { ok: true };
}

/**
 * Bulk actions per <recurring_invoices_spec> "Bulk: Stop, Resume, Delete".
 * Stop: ACTIVE → STOPPED. Resume: STOPPED/PAUSED → ACTIVE.
 */
export async function bulkStopRecurringAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringInvoice.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: "ACTIVE",
    },
    data: { status: "STOPPED", isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringInvoice",
    entityId: `bulk-${Date.now()}`,
    after: { status: "STOPPED", count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/recurring-invoices");
  return { ok: true, updated: result.count };
}

export async function bulkResumeRecurringAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringInvoice.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["STOPPED", "PAUSED"] },
    },
    data: { status: "ACTIVE", isActive: true },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringInvoice",
    entityId: `bulk-${Date.now()}`,
    after: { status: "ACTIVE", count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/recurring-invoices");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteRecurringAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringInvoice.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { deletedAt: new Date(), isActive: false, status: "STOPPED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "RecurringInvoice",
    entityId: `bulk-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/recurring-invoices");
  return { ok: true, updated: result.count };
}

export { computeNextOccurrence };
