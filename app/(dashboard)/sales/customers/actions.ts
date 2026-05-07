"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { customerSchema, type CustomerInput } from "@/lib/validations/customer";

/**
 * Customer = Contact with type=CUSTOMER. The Sales/Customers page filters
 * `Contact` rows by type and the `deletedAt` flag.
 *
 * All mutations write AuditLog. Soft-delete is the default; hard-delete is
 * blocked when there are open invoices, payments, or active recurring
 * profiles tied to the contact.
 */

export async function createCustomerAction(input: CustomerInput) {
  const { user, organization } = await requireOrganization();
  const data = customerSchema.parse(input);

  const dup = await db.contact.findFirst({
    where: {
      organizationId: organization.id,
      displayName: data.displayName,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (dup) {
    throw new Error(`A customer named "${data.displayName}" already exists`);
  }

  const created = await db.$transaction(async (tx) => {
    const c = await tx.contact.create({
      data: {
        organizationId: organization.id,
        type: "CUSTOMER",
        customerType: data.customerType,
        salutation: data.salutation ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        companyName: data.companyName ?? null,
        displayName: data.displayName,
        email: data.email || null,
        workPhone: data.workPhone || null,
        workPhoneCountry: data.workPhoneCountry,
        mobile: data.mobile || null,
        mobileCountry: data.mobileCountry,
        language: data.language,
        pan: data.pan || null,
        gstin: data.gstin || null,
        gstTreatment: data.gstTreatment || null,
        placeOfSupply: data.placeOfSupply || null,
        taxPreference: data.taxPreference || null,
        currency: data.currency,
        paymentTermsId: data.paymentTermsId || null,
        enablePortal: data.enablePortal,
        portalLanguage: data.portalLanguage || null,
        customerOwnerId: data.customerOwnerId || null,
        openingBalance: data.openingBalance ?? null,
        openingBalanceAsOf: data.openingBalanceAsOf ?? null,
        websiteUrl: data.websiteUrl || null,
        facebookUrl: data.facebookUrl || null,
        twitterHandle: data.twitterHandle || null,
        notes: data.notes || null,
      },
    });
    if (data.addresses && data.addresses.length > 0) {
      await tx.contactAddress.createMany({
        data: data.addresses.map((a) => ({ ...a, contactId: c.id })),
      });
    }
    if (data.contactPersons && data.contactPersons.length > 0) {
      await tx.contactPerson.createMany({
        data: data.contactPersons.map((p) => ({
          contactId: c.id,
          salutation: p.salutation ?? null,
          firstName: p.firstName ?? null,
          lastName: p.lastName ?? null,
          email: p.email || null,
          workPhone: p.workPhone ?? null,
          mobile: p.mobile ?? null,
          designation: p.designation ?? null,
          department: p.department ?? null,
          isPrimary: p.isPrimary ?? false,
        })),
      });
    }
    return c;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Contact",
    entityId: created.id,
    after: { displayName: created.displayName, type: created.type },
  });

  revalidatePath("/sales/customers");
  redirect(`/sales/customers/${created.id}`);
}

export async function updateCustomerAction(id: string, input: CustomerInput) {
  const { user, organization } = await requireOrganization();
  const data = customerSchema.parse(input);
  const before = await db.contact.findFirst({
    where: { id, organizationId: organization.id, type: { in: ["CUSTOMER", "BOTH"] } },
  });
  if (!before) throw new Error("Customer not found");

  await db.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id },
      data: {
        customerType: data.customerType,
        salutation: data.salutation ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        companyName: data.companyName ?? null,
        displayName: data.displayName,
        email: data.email || null,
        workPhone: data.workPhone || null,
        workPhoneCountry: data.workPhoneCountry,
        mobile: data.mobile || null,
        mobileCountry: data.mobileCountry,
        language: data.language,
        pan: data.pan || null,
        gstin: data.gstin || null,
        gstTreatment: data.gstTreatment || null,
        placeOfSupply: data.placeOfSupply || null,
        taxPreference: data.taxPreference || null,
        currency: data.currency,
        paymentTermsId: data.paymentTermsId || null,
        enablePortal: data.enablePortal,
        portalLanguage: data.portalLanguage || null,
        customerOwnerId: data.customerOwnerId || null,
        openingBalance: data.openingBalance ?? null,
        openingBalanceAsOf: data.openingBalanceAsOf ?? null,
        websiteUrl: data.websiteUrl || null,
        facebookUrl: data.facebookUrl || null,
        twitterHandle: data.twitterHandle || null,
        notes: data.notes || null,
      },
    });
    // Replace addresses + contact persons wholesale (simple, predictable)
    await tx.contactAddress.deleteMany({ where: { contactId: id } });
    if (data.addresses && data.addresses.length > 0) {
      await tx.contactAddress.createMany({
        data: data.addresses.map((a) => ({ ...a, contactId: id })),
      });
    }
    await tx.contactPerson.deleteMany({ where: { contactId: id } });
    if (data.contactPersons && data.contactPersons.length > 0) {
      await tx.contactPerson.createMany({
        data: data.contactPersons.map((p) => ({
          contactId: id,
          salutation: p.salutation ?? null,
          firstName: p.firstName ?? null,
          lastName: p.lastName ?? null,
          email: p.email || null,
          workPhone: p.workPhone ?? null,
          mobile: p.mobile ?? null,
          designation: p.designation ?? null,
          department: p.department ?? null,
          isPrimary: p.isPrimary ?? false,
        })),
      });
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Contact",
    entityId: id,
    before: { displayName: before.displayName },
    after: { displayName: data.displayName },
  });

  revalidatePath("/sales/customers");
  revalidatePath(`/sales/customers/${id}`);
  redirect(`/sales/customers/${id}`);
}

export async function softDeleteCustomerAction(id: string) {
  const { user, organization } = await requireOrganization();
  const c = await db.contact.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!c) return { ok: false, error: "Customer not found" };

  // Block delete when there are active recurring profiles or unpaid invoices
  const activeRecurring = await db.recurringInvoice.count({
    where: { contactId: id, status: "ACTIVE", deletedAt: null },
  });
  if (activeRecurring > 0) {
    return { ok: false, error: "Cannot delete: customer has active recurring invoices" };
  }
  const unpaidInvoices = await db.invoice.count({
    where: {
      contactId: id,
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
  });
  if (unpaidInvoices > 0) {
    return { ok: false, error: "Cannot delete: customer has unpaid invoices" };
  }

  await db.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Contact",
    entityId: id,
    before: { displayName: c.displayName },
  });
  revalidatePath("/sales/customers");
  return { ok: true };
}

export async function restoreCustomerAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.contact.update({
    where: { id },
    data: { deletedAt: null },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "RESTORE",
    entityType: "Contact",
    entityId: id,
  });
  revalidatePath("/sales/customers");
  return { ok: true };
}

export async function setCustomerActiveAction(id: string, isInactive: boolean) {
  const { user, organization } = await requireOrganization();
  await db.contact.update({
    where: { id },
    data: { isInactive },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Contact",
    entityId: id,
    after: { isInactive },
  });
  revalidatePath("/sales/customers");
  revalidatePath(`/sales/customers/${id}`);
  return { ok: true };
}

export async function togglePortalAccessAction(id: string, enable: boolean) {
  const { user, organization } = await requireOrganization();
  await db.contact.update({
    where: { id },
    data: { enablePortal: enable },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Contact",
    entityId: id,
    after: { enablePortal: enable },
  });
  revalidatePath(`/sales/customers/${id}`);
  return { ok: true };
}

/**
 * Upload one or more documents (data-URL fallback per D36) attached to
 * a customer. Per <customers_spec>: "max 10 files × 10MB each".
 */
const documentInputSchema = z.object({
  contactId: z.string(),
  files: z
    .array(
      z.object({
        fileName: z.string().min(1).max(200),
        fileUrl: z.string().min(1), // data: URL
        fileSize: z.coerce.number().int().nonnegative(),
        mimeType: z.string().min(1).max(120),
      })
    )
    .min(1)
    .max(10),
});

export async function uploadCustomerDocumentsAction(
  input: z.input<typeof documentInputSchema>
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const data = documentInputSchema.parse(input);
  const c = await db.contact.findFirst({
    where: {
      id: data.contactId,
      organizationId: organization.id,
      deletedAt: null,
    },
  });
  if (!c) throw new Error("Customer not found");
  const existing = await db.contactDocument.count({
    where: { contactId: data.contactId },
  });
  if (existing + data.files.length > 10) {
    throw new Error("Customers are limited to 10 documents");
  }
  for (const f of data.files) {
    if (f.fileSize > 10 * 1024 * 1024) {
      throw new Error(`${f.fileName} exceeds 10MB`);
    }
  }
  await db.contactDocument.createMany({
    data: data.files.map((f) => ({
      contactId: data.contactId,
      fileName: f.fileName,
      fileUrl: f.fileUrl,
      fileSize: f.fileSize,
      mimeType: f.mimeType,
      uploadedById: user.id,
    })),
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "ContactDocument",
    entityId: data.contactId,
    after: { count: data.files.length },
  });
  revalidatePath(`/sales/customers/${data.contactId}`);
}

export async function deleteCustomerDocumentAction(
  documentId: string
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const doc = await db.contactDocument.findUnique({
    where: { id: documentId },
    include: { contact: { select: { organizationId: true, id: true } } },
  });
  if (!doc || doc.contact.organizationId !== organization.id) {
    throw new Error("Document not found");
  }
  await db.contactDocument.delete({ where: { id: documentId } });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "ContactDocument",
    entityId: doc.contact.id,
    before: { fileName: doc.fileName },
  });
  revalidatePath(`/sales/customers/${doc.contact.id}`);
}

/**
 * Email a customer statement covering the requested date range. The PDF
 * itself is generated by the /sales/customers/[id]/statement route; this
 * action enqueues an EmailJob with a body that links to that PDF (we
 * can't sensibly attach binary inside the EmailJob queue without S3 first).
 */
export async function emailCustomerStatementAction(input: {
  contactId: string;
  from: string; // yyyy-MM-dd
  to: string;
}): Promise<void> {
  const { user, organization } = await requireOrganization();
  const c = await db.contact.findFirst({
    where: {
      id: input.contactId,
      organizationId: organization.id,
      deletedAt: null,
    },
  });
  if (!c) throw new Error("Customer not found");
  if (!c.email) throw new Error("Customer has no email on file");

  const { enqueueEmail } = await import("@/lib/sales/email-sender");
  await enqueueEmail({
    organizationId: organization.id,
    toEmail: c.email,
    subject: `Statement of Account from ${organization.name}`,
    bodyHtml: `<p>Hello ${c.displayName},</p>
<p>Your statement of account for the period ${input.from} to ${input.to} is available at:</p>
<p><a href="${process.env.NEXTAUTH_URL ?? ""}/sales/customers/${c.id}/statement?from=${input.from}&to=${input.to}">View statement (PDF)</a></p>
<p>Thank you,<br/>${organization.name}</p>`,
    documentType: "CUSTOMER_STATEMENT",
    documentId: c.id,
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "CustomerStatementEmail",
    entityId: c.id,
    after: { from: input.from, to: input.to },
  });
  revalidatePath(`/sales/customers/${c.id}`);
}

const remarkSchema = z.object({ body: z.string().min(1).max(2000) });

export async function addRemarkAction(contactId: string, input: { body: string }) {
  const { user, organization } = await requireOrganization();
  const data = remarkSchema.parse(input);
  await db.contactRemark.create({
    data: { contactId, body: data.body, authorId: user.id },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "ContactRemark",
    entityId: contactId,
  });
  revalidatePath(`/sales/customers/${contactId}`);
  return { ok: true };
}
