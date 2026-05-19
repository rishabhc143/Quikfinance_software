"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { computeDocument } from "@/lib/sales/totals";
import {
  recurringBillSchema,
  type RecurringBillInput,
} from "@/lib/validations/recurring-bill";
import {
  generateBillFromProfile,
  advanceRecurringBillCursor,
  computeNextOccurrence,
} from "@/lib/purchases/recurring";

export type { RecurringBillInput };

/**
 * Recurring Bills server actions per <recurring_bills_spec>.
 *
 * Profile lifecycle: ACTIVE → PAUSED ⇄ → STOPPED / EXPIRED.
 * Generation: daily cron `/api/cron/recurring-bills` reads
 * `templateJson` set here and unpacks into Bill + BillLineItem
 * rows.
 */

async function totalsFor(orgId: string, input: RecurringBillInput) {
  const taxes = await db.tax.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, rate: true },
  });
  const taxRate = (id?: string | null) =>
    (id ? taxes.find((t) => t.id === id)?.rate : null) ?? 0;
  const docTaxRate = input.documentTax
    ? Number(taxRate(input.documentTax.taxId))
    : 0;
  return computeDocument({
    lines: input.lines.map((l) => ({
      quantity: l.quantity ?? 0,
      rate: l.rate ?? 0,
      taxRate: Number(taxRate(l.taxId)),
    })),
    documentDiscount: input.documentDiscount
      ? {
          value: input.documentDiscount.value ?? 0,
          type: input.documentDiscount.type ?? "percentage",
        }
      : undefined,
    documentTax: input.documentTax
      ? { rate: docTaxRate, type: input.documentTax.type }
      : undefined,
    adjustment: input.adjustmentValue ?? 0,
  });
}

function buildTemplateJson(input: RecurringBillInput, totals: ReturnType<typeof computeDocument>) {
  return {
    referenceNumber: input.referenceNumber ?? null,
    paymentTermsId: input.paymentTermsId ?? null,
    placeOfSupply: input.placeOfSupply ?? null,
    currency: input.currency,
    subtotal: Number(totals.subTotal),
    discountValue: input.documentDiscount?.value ?? 0,
    discountType: input.documentDiscount?.type ?? "percentage",
    taxId: input.documentTax?.taxId ?? null,
    taxTotal: Number(totals.documentTaxAmount),
    adjustmentLabel: input.adjustmentLabel ?? "Adjustment",
    adjustmentValue: input.adjustmentValue ?? 0,
    total: Number(totals.total),
    termsAndConditions: input.termsAndConditions ?? null,
    lines: input.lines.map((l, i) => ({
      itemId: l.itemId ?? null,
      position: l.position ?? i,
      name: l.name,
      description: l.description ?? null,
      hsnSacCode: l.hsnSacCode ?? null,
      accountId: l.accountId ?? null,
      billableToCustomerId: l.billableToCustomerId ?? null,
      quantity: l.quantity,
      rate: l.rate,
      taxId: l.taxId ?? null,
      amount: Number(totals.lines[i]?.amount ?? 0),
    })),
  };
}

export async function createRecurringBillAction(input: RecurringBillInput) {
  const { user, organization } = await requireOrganization();
  const data = recurringBillSchema.parse(input);
  const totals = await totalsFor(organization.id, data);
  const template = buildTemplateJson(data, totals);
  const total = Number(totals.total);

  // First-run cursor = startDate. Cron's where-clause uses
  // `nextRunAt <= now()`.
  const created = await db.recurringBill.create({
    data: {
      organizationId: organization.id,
      profileName: data.profileName,
      contactId: data.contactId,
      frequency: data.frequency,
      intervalN: data.intervalN,
      startDate: data.startDate,
      endDate: data.neverExpires ? null : data.endDate ?? null,
      neverExpires: data.neverExpires,
      nextRunAt: data.startDate,
      nextOccurrenceDate: data.startDate,
      status: data.status,
      isActive: data.status === "ACTIVE",
      amount: total,
      templateJson: template,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "RecurringBill",
    entityId: created.id,
    after: {
      profileName: created.profileName,
      frequency: created.frequency,
      total,
    },
  });
  revalidatePath("/purchases/recurring-bills");
  redirect(`/purchases/recurring-bills/${created.id}`);
}

export async function updateRecurringBillAction(
  id: string,
  input: RecurringBillInput
) {
  const { user, organization } = await requireOrganization();
  const data = recurringBillSchema.parse(input);
  const before = await db.recurringBill.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Recurring bill not found");
  if (before.status === "STOPPED" || before.status === "EXPIRED") {
    throw new Error(
      `Cannot edit a ${before.status.toLowerCase()} profile.`
    );
  }
  const totals = await totalsFor(organization.id, data);
  const template = buildTemplateJson(data, totals);
  const total = Number(totals.total);

  await db.recurringBill.update({
    where: { id },
    data: {
      profileName: data.profileName,
      contactId: data.contactId,
      frequency: data.frequency,
      intervalN: data.intervalN,
      startDate: data.startDate,
      endDate: data.neverExpires ? null : data.endDate ?? null,
      neverExpires: data.neverExpires,
      status: data.status,
      isActive: data.status === "ACTIVE",
      amount: total,
      templateJson: template,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringBill",
    entityId: id,
    before: { profileName: before.profileName, status: before.status },
    after: { profileName: data.profileName, status: data.status },
  });
  revalidatePath("/purchases/recurring-bills");
  revalidatePath(`/purchases/recurring-bills/${id}`);
  redirect(`/purchases/recurring-bills/${id}`);
}

// ───── Transitions ────────────────────────────────────────────────

export async function pauseRecurringBillAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringBill.update({
    where: { id, organizationId: organization.id },
    data: { status: "PAUSED", isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringBill",
    entityId: id,
    after: { status: "PAUSED" },
  });
  revalidatePath("/purchases/recurring-bills");
  revalidatePath(`/purchases/recurring-bills/${id}`);
}

export async function resumeRecurringBillAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringBill.update({
    where: { id, organizationId: organization.id },
    data: { status: "ACTIVE", isActive: true },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringBill",
    entityId: id,
    after: { status: "ACTIVE" },
  });
  revalidatePath("/purchases/recurring-bills");
  revalidatePath(`/purchases/recurring-bills/${id}`);
}

export async function stopRecurringBillAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.recurringBill.update({
    where: { id, organizationId: organization.id },
    data: { status: "STOPPED", isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringBill",
    entityId: id,
    after: { status: "STOPPED" },
  });
  revalidatePath("/purchases/recurring-bills");
  revalidatePath(`/purchases/recurring-bills/${id}`);
}

/**
 * "Run Now" — generates a Bill immediately bypassing the cron's
 * once-per-day cadence guard. Useful for testing or catching up on
 * a missed run. The same generator + idempotency check is reused.
 */
export async function runRecurringBillNowAction(
  id: string
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const profile = await db.recurringBill.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!profile) throw new Error("Recurring bill not found");
  if (profile.status !== "ACTIVE") {
    throw new Error(
      `Cannot run a ${profile.status.toLowerCase()} profile — resume it first.`
    );
  }
  const today = new Date();
  await generateBillFromProfile(id, today);
  // Don't advance the cursor — the user might want the daily cron
  // to also fire. Or do? Per the reference design, Run Now does advance. We
  // do advance to keep the cron + UI consistent.
  await advanceRecurringBillCursor(id, today);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringBill",
    entityId: id,
    after: { ranNow: true, ranAt: today.toISOString() },
  });
  revalidatePath("/purchases/recurring-bills");
  revalidatePath(`/purchases/recurring-bills/${id}`);
  revalidatePath("/purchases/bills");
}

/**
 * Compute the next 5 occurrence dates from the current cursor —
 * shown on the detail page so the user sees what the cron will do.
 */
export async function previewNextRunsAction(input: {
  recurringBillId: string;
}): Promise<Date[]> {
  const { organization } = await requireOrganization();
  const profile = await db.recurringBill.findFirst({
    where: {
      id: input.recurringBillId,
      organizationId: organization.id,
      deletedAt: null,
    },
  });
  if (!profile) return [];
  const out: Date[] = [];
  let cursor = profile.nextRunAt;
  for (let i = 0; i < 5; i += 1) {
    out.push(cursor);
    cursor = computeNextOccurrence(
      cursor,
      profile.frequency,
      profile.intervalN
    );
    if (!profile.neverExpires && profile.endDate && cursor > profile.endDate) {
      break;
    }
  }
  return out;
}

// ───── Bulk handlers retained from the parity sweep ──────────────

export async function bulkPauseRecurringBillsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringBill.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { isActive: false, status: "PAUSED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringBill",
    entityId: `bulk-pause-${Date.now()}`,
    after: { count: result.count, ids: input.ids, status: "PAUSED" },
  });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true, updated: result.count };
}

export async function bulkResumeRecurringBillsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringBill.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { isActive: true, status: "ACTIVE" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "RecurringBill",
    entityId: `bulk-resume-${Date.now()}`,
    after: { count: result.count, ids: input.ids, status: "ACTIVE" },
  });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteRecurringBillsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.recurringBill.updateMany({
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
    entityType: "RecurringBill",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true, updated: result.count };
}

export async function deleteRecurringBillAction(id: string) {
  const { user, organization } = await requireOrganization();
  const r = await db.recurringBill.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!r) return { ok: false };
  await db.recurringBill.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, status: "STOPPED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "RecurringBill",
    entityId: id,
    before: { profileName: r.profileName },
  });
  revalidatePath("/purchases/recurring-bills");
  return { ok: true };
}
