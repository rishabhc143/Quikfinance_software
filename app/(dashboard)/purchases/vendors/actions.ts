"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { vendorSchema, type VendorInput } from "@/lib/validations/vendor";

/**
 * Vendor server actions.
 *
 * Vendors are Contact rows with type IN (VENDOR, BOTH). Reuses the
 * existing Contact table per the master prompt's "one Contact table"
 * decision — no separate Vendor model.
 *
 * Vendor-specific extensions (MSME registration, default TDS, bank
 * accounts, vendor-portal token) live on Contact's new columns (PR
 * #81) and the ContactBankAccount table. The zod schema + types live
 * in `lib/validations/vendor.ts` so the form, the import wizard, and
 * the unit tests share one source of truth.
 */

export type { VendorInput };

function normalize(raw: VendorInput) {
  const parsed = vendorSchema.parse(raw);
  return {
    ...parsed,
    email: parsed.email && parsed.email !== "" ? parsed.email : null,
    gstin: parsed.gstin?.toUpperCase() ?? null,
    pan: parsed.pan?.toUpperCase() ?? null,
    msmeRegisteredDate: parsed.msmeRegisteredDate
      ? new Date(parsed.msmeRegisteredDate)
      : null,
  };
}

export async function createVendorAction(input: VendorInput) {
  const { user, organization } = await requireOrganization();
  const data = normalize(input);

  // Block duplicate display name across vendors (per spec — unique
  // per org per type=VENDOR).
  const dup = await db.contact.findFirst({
    where: {
      organizationId: organization.id,
      displayName: data.displayName,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (dup) {
    throw new Error(`A vendor named "${data.displayName}" already exists`);
  }

  const created = await db.$transaction(async (tx) => {
    const c = await tx.contact.create({
      data: {
        organizationId: organization.id,
        type: "VENDOR",
        salutation: data.salutation ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        companyName: data.companyName ?? null,
        displayName: data.displayName,
        email: data.email,
        workPhone: data.workPhone ?? null,
        workPhoneCountry: data.workPhoneCountry ?? "+91",
        mobile: data.mobile ?? null,
        mobileCountry: data.mobileCountry ?? "+91",
        language: data.language ?? "en",
        pan: data.pan,
        gstin: data.gstin,
        gstTreatment: data.gstTreatment ?? null,
        placeOfSupply: data.placeOfSupply ?? null,
        taxPreference: data.taxPreference ?? null,
        currency: data.currency ?? null,
        accountsPayableId: data.accountsPayableId ?? null,
        openingBalance: data.openingBalance ?? null,
        paymentTermsId: data.paymentTermsId ?? null,
        defaultTdsId: data.defaultTdsId ?? null,
        enableVendorPortal: data.enableVendorPortal ?? false,
        msmeRegistered: data.msmeRegistered ?? null,
        msmeNumber: data.msmeNumber ?? null,
        msmeCategory: data.msmeCategory ?? null,
        msmeRegisteredDate: data.msmeRegisteredDate,
        websiteUrl: data.websiteUrl ?? null,
        facebookUrl: data.facebookUrl ?? null,
        twitterHandle: data.twitterHandle ?? null,
        notes: data.notes ?? null,
      },
    });
    if (data.bankAccounts && data.bankAccounts.length > 0) {
      await tx.contactBankAccount.createMany({
        data: data.bankAccounts.map((b, i) => ({
          contactId: c.id,
          accountHolderName: b.accountHolderName ?? null,
          bankName: b.bankName ?? null,
          accountNumber: b.accountNumber,
          ifscCode: b.ifscCode.toUpperCase(),
          isDefault: !!b.isDefault || i === 0, // first row is default if none set
          position: i,
        })),
      });
    }
    if (data.addresses && data.addresses.length > 0) {
      await tx.contactAddress.createMany({
        data: data.addresses.map((a) => ({
          contactId: c.id,
          kind: a.kind,
          attention: a.attention ?? null,
          country: a.country ?? "India",
          addressLine1: a.addressLine1 ?? null,
          addressLine2: a.addressLine2 ?? null,
          city: a.city ?? null,
          state: a.state ?? null,
          zipCode: a.zipCode ?? null,
          phone: a.phone ?? null,
          fax: a.fax ?? null,
          isDefault: a.isDefault ?? false,
        })),
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
    entityType: "Vendor",
    entityId: created.id,
    after: { displayName: created.displayName },
  });
  revalidatePath("/purchases/vendors");
  redirect(`/purchases/vendors/${created.id}`);
}

export async function updateVendorAction(id: string, input: VendorInput) {
  const { user, organization } = await requireOrganization();
  const data = normalize(input);
  const before = await db.contact.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Vendor not found");

  await db.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id },
      data: {
        salutation: data.salutation ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        companyName: data.companyName ?? null,
        displayName: data.displayName,
        email: data.email,
        workPhone: data.workPhone ?? null,
        workPhoneCountry: data.workPhoneCountry ?? "+91",
        mobile: data.mobile ?? null,
        mobileCountry: data.mobileCountry ?? "+91",
        language: data.language ?? "en",
        pan: data.pan,
        gstin: data.gstin,
        gstTreatment: data.gstTreatment ?? null,
        placeOfSupply: data.placeOfSupply ?? null,
        taxPreference: data.taxPreference ?? null,
        currency: data.currency ?? null,
        accountsPayableId: data.accountsPayableId ?? null,
        openingBalance: data.openingBalance ?? null,
        paymentTermsId: data.paymentTermsId ?? null,
        defaultTdsId: data.defaultTdsId ?? null,
        enableVendorPortal: data.enableVendorPortal ?? false,
        msmeRegistered: data.msmeRegistered ?? null,
        msmeNumber: data.msmeNumber ?? null,
        msmeCategory: data.msmeCategory ?? null,
        msmeRegisteredDate: data.msmeRegisteredDate,
        websiteUrl: data.websiteUrl ?? null,
        facebookUrl: data.facebookUrl ?? null,
        twitterHandle: data.twitterHandle ?? null,
        notes: data.notes ?? null,
      },
    });
    // Replace bank accounts / addresses / contact persons wholesale
    // (simpler than diffing; users typically don't tweak these
    // collections per-row — the form rebuilds the array).
    await tx.contactBankAccount.deleteMany({ where: { contactId: id } });
    if (data.bankAccounts && data.bankAccounts.length > 0) {
      await tx.contactBankAccount.createMany({
        data: data.bankAccounts.map((b, i) => ({
          contactId: id,
          accountHolderName: b.accountHolderName ?? null,
          bankName: b.bankName ?? null,
          accountNumber: b.accountNumber,
          ifscCode: b.ifscCode.toUpperCase(),
          isDefault: !!b.isDefault || i === 0,
          position: i,
        })),
      });
    }
    await tx.contactAddress.deleteMany({ where: { contactId: id } });
    if (data.addresses && data.addresses.length > 0) {
      await tx.contactAddress.createMany({
        data: data.addresses.map((a) => ({
          contactId: id,
          kind: a.kind,
          attention: a.attention ?? null,
          country: a.country ?? "India",
          addressLine1: a.addressLine1 ?? null,
          addressLine2: a.addressLine2 ?? null,
          city: a.city ?? null,
          state: a.state ?? null,
          zipCode: a.zipCode ?? null,
          phone: a.phone ?? null,
          fax: a.fax ?? null,
          isDefault: a.isDefault ?? false,
        })),
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
    entityType: "Vendor",
    entityId: id,
    before: { displayName: before.displayName },
    after: { displayName: data.displayName },
  });
  revalidatePath("/purchases/vendors");
  revalidatePath(`/purchases/vendors/${id}`);
  redirect(`/purchases/vendors/${id}`);
}

export async function deleteVendorAction(id: string) {
  const { user, organization } = await requireOrganization();
  const c = await db.contact.findFirst({
    where: { id, organizationId: organization.id },
    select: { id: true, displayName: true },
  });
  if (!c) return { ok: false, error: "Vendor not found" };

  // Block delete when the vendor has non-void bills / POs / payments
  // / credits. Soft-delete is fine if everything is clean.
  const [openBills, openPos, openCredits, openPayments] = await Promise.all([
    db.bill.count({
      where: {
        contactId: id,
        organizationId: organization.id,
        deletedAt: null,
        status: { notIn: ["VOID"] },
      },
    }),
    db.purchaseOrder.count({
      where: {
        contactId: id,
        organizationId: organization.id,
        deletedAt: null,
        status: { notIn: ["CANCELLED"] },
      },
    }),
    db.vendorCredit.count({
      where: {
        contactId: id,
        organizationId: organization.id,
        deletedAt: null,
        status: { notIn: ["VOID"] },
      },
    }),
    db.paymentMade.count({
      where: {
        contactId: id,
        organizationId: organization.id,
        deletedAt: null,
      },
    }),
  ]);
  if (openBills + openPos + openCredits + openPayments > 0) {
    return {
      ok: false,
      error:
        "Cannot delete a vendor with open bills, POs, credits, or payments. Mark them void first.",
    };
  }

  await db.contact.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Vendor",
    entityId: id,
    before: { displayName: c.displayName },
  });
  revalidatePath("/purchases/vendors");
  return { ok: true };
}

/**
 * Thin wrappers so the BulkAwareDataTable can be passed a direct
 * server-action reference. Inline arrow wrappers (`async (input) =>
 * bulkSetVendorActive(...)`) cannot cross the server-to-client
 * component boundary — Next refuses to serialize them.
 */
export async function bulkMarkVendorsActiveAction(input: { ids: string[] }) {
  return bulkSetVendorActiveAction({ ids: input.ids, isInactive: false });
}
export async function bulkMarkVendorsInactiveAction(input: { ids: string[] }) {
  return bulkSetVendorActiveAction({ ids: input.ids, isInactive: true });
}

export async function bulkSetVendorActiveAction(input: {
  ids: string[];
  isInactive: boolean;
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.contact.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    data: { isInactive: input.isInactive },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Vendor",
    entityId: `bulk-${Date.now()}`,
    after: { isInactive: input.isInactive, count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/vendors");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteVendorsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Per-row guard — keep it conservative; bulk-delete blocks the
  // whole batch if any row has open business.
  const blocked = await db.bill.count({
    where: {
      contactId: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: { notIn: ["VOID"] },
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} bill${blocked === 1 ? "" : "s"} block the delete. Void them first.`,
    };
  }
  const result = await db.contact.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Vendor",
    entityId: `bulk-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/vendors");
  return { ok: true, updated: result.count };
}
