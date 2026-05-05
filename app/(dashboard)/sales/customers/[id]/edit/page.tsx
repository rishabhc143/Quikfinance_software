import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "../../customer-form";
import { updateCustomerAction } from "../../actions";
import type { CustomerInput } from "@/lib/validations/customer";

export const metadata = { title: "Edit Customer" };

export default async function EditCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const c = await db.contact.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      type: { in: ["CUSTOMER", "BOTH"] },
    },
    include: {
      addresses: true,
      contactPersons: { orderBy: { isPrimary: "desc" } },
    },
  });
  if (!c) notFound();

  const paymentTerms = await db.paymentTerms.findMany({
    where: { organizationId: organization.id },
    orderBy: { numberOfDays: "asc" },
  });

  const initial: Partial<CustomerInput> = {
    customerType: c.customerType,
    salutation: c.salutation ?? "",
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    companyName: c.companyName ?? "",
    displayName: c.displayName,
    email: c.email ?? "",
    workPhone: c.workPhone ?? "",
    workPhoneCountry: c.workPhoneCountry ?? "+91",
    mobile: c.mobile ?? "",
    mobileCountry: c.mobileCountry ?? "+91",
    language: c.language,
    pan: c.pan ?? "",
    gstin: c.gstin ?? "",
    gstTreatment: c.gstTreatment ?? "",
    placeOfSupply: c.placeOfSupply ?? "",
    taxPreference: (c.taxPreference as "taxable" | "tax_exempt" | null) ?? "taxable",
    currency: c.currency ?? organization.currency,
    paymentTermsId: c.paymentTermsId,
    enablePortal: c.enablePortal,
    portalLanguage: c.portalLanguage,
    customerOwnerId: c.customerOwnerId,
    openingBalance: c.openingBalance ? Number(c.openingBalance) : null,
    openingBalanceAsOf: c.openingBalanceAsOf,
    websiteUrl: c.websiteUrl ?? "",
    facebookUrl: c.facebookUrl ?? "",
    twitterHandle: c.twitterHandle ?? "",
    notes: c.notes ?? "",
    addresses: c.addresses.map((a) => ({
      kind: a.kind as "billing" | "shipping" | "other",
      attention: a.attention ?? "",
      country: a.country,
      addressLine1: a.addressLine1 ?? "",
      addressLine2: a.addressLine2 ?? "",
      city: a.city ?? "",
      state: a.state ?? "",
      zipCode: a.zipCode ?? "",
      phone: a.phone ?? "",
      fax: a.fax ?? "",
      isDefault: a.isDefault,
    })),
    contactPersons: c.contactPersons.map((p) => ({
      salutation: p.salutation ?? "",
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      email: p.email ?? "",
      workPhone: p.workPhone ?? "",
      mobile: p.mobile ?? "",
      designation: p.designation ?? "",
      department: p.department ?? "",
      isPrimary: p.isPrimary,
    })),
  };

  async function submit(values: CustomerInput) {
    "use server";
    await updateCustomerAction(params.id, values);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href={`/sales/customers/${c.id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">Edit Customer</h1>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Close">
          <Link href={`/sales/customers/${c.id}`}>
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <CustomerForm
        initial={initial}
        defaultCurrency={organization.currency}
        paymentTermsOptions={paymentTerms.map((p) => ({
          value: p.id,
          label: p.name,
          hint: p.numberOfDays === 0 ? "Due on receipt" : `${p.numberOfDays} days`,
        }))}
        onSubmitAction={submit}
        submitLabel="Update customer"
        cancelHref={`/sales/customers/${c.id}`}
      />
    </div>
  );
}
