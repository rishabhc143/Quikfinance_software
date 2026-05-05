"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocument } from "@/lib/sales/totals";
import {
  deliveryChallanSchema,
  type DeliveryChallanInput,
} from "@/lib/validations/delivery-challan";

async function totalsFor(orgId: string, input: DeliveryChallanInput) {
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

export async function createDeliveryChallanAction(input: DeliveryChallanInput) {
  const { user, organization } = await requireOrganization();
  const data = deliveryChallanSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "DELIVERY_CHALLAN");
  const totals = await totalsFor(organization.id, data);

  const created = await db.deliveryChallan.create({
    data: {
      organizationId: organization.id,
      number,
      referenceNumber: data.referenceNumber ?? null,
      contactId: data.contactId,
      status: "DRAFT",
      date: data.challanDate,
      challanType: data.challanType,
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
    entityType: "DeliveryChallan",
    entityId: created.id,
    after: { number: created.number, status: created.status },
  });
  revalidatePath("/sales/delivery-challans");
  redirect(`/sales/delivery-challans/${created.id}`);
}

export async function markChallanDeliveredAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.deliveryChallan.update({
    where: { id },
    data: { status: "DELIVERED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DeliveryChallan",
    entityId: id,
    after: { status: "DELIVERED" },
  });
  revalidatePath(`/sales/delivery-challans/${id}`);
}

export async function markChallanReturnedAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.deliveryChallan.update({
    where: { id },
    data: { status: "RETURNED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DeliveryChallan",
    entityId: id,
    after: { status: "RETURNED" },
  });
  revalidatePath(`/sales/delivery-challans/${id}`);
}

export async function deleteDeliveryChallanAction(id: string) {
  const { user, organization } = await requireOrganization();
  const c = await db.deliveryChallan.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!c) return { ok: false };
  await db.deliveryChallan.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "DeliveryChallan",
    entityId: id,
    before: { number: c.number },
  });
  revalidatePath("/sales/delivery-challans");
  return { ok: true };
}
