import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { VendorForm } from "../../vendor-form";
import { updateVendorAction, type VendorInput } from "../../actions";

export const metadata = { title: "Edit Vendor" };

export default async function EditVendorPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const [v, paymentTerms, apAccounts, tdsTaxes] = await Promise.all([
    db.contact.findFirst({
      where: {
        id: params.id,
        organizationId: organization.id,
        type: { in: ["VENDOR", "BOTH"] },
      },
      include: {
        bankAccounts: { orderBy: { position: "asc" } },
        addresses: true,
        contactPersons: { orderBy: { isPrimary: "desc" } },
      },
    }),
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      orderBy: { numberOfDays: "asc" },
      select: { id: true, name: true },
    }),
    db.chartOfAccount.findMany({
      where: {
        organizationId: organization.id,
        type: "LIABILITY",
        isActive: true,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    db.tax.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        OR: [{ type: "TDS" }, { type: "tds" }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, rate: true },
    }),
  ]);
  if (!v) notFound();

  // Map the Contact row + child collections into the VendorInput
  // shape the form expects.
  const initial: Partial<VendorInput> & { id: string } = {
    id: v.id,
    salutation: v.salutation,
    firstName: v.firstName,
    lastName: v.lastName,
    companyName: v.companyName,
    displayName: v.displayName,
    email: v.email,
    workPhone: v.workPhone,
    workPhoneCountry: v.workPhoneCountry ?? "+91",
    mobile: v.mobile,
    mobileCountry: v.mobileCountry ?? "+91",
    language: v.language ?? "en",
    pan: v.pan,
    gstin: v.gstin,
    gstTreatment: v.gstTreatment,
    placeOfSupply: v.placeOfSupply,
    taxPreference: v.taxPreference,
    currency: v.currency ?? "INR",
    accountsPayableId: v.accountsPayableId,
    openingBalance: v.openingBalance ? Number(v.openingBalance) : 0,
    paymentTermsId: v.paymentTermsId,
    defaultTdsId: v.defaultTdsId,
    enableVendorPortal: v.enableVendorPortal,
    msmeRegistered: v.msmeRegistered,
    msmeNumber: v.msmeNumber,
    msmeCategory: v.msmeCategory,
    msmeRegisteredDate: v.msmeRegisteredDate
      ? v.msmeRegisteredDate.toISOString().slice(0, 10)
      : "",
    websiteUrl: v.websiteUrl,
    facebookUrl: v.facebookUrl,
    twitterHandle: v.twitterHandle,
    notes: v.notes,
    bankAccounts: v.bankAccounts.map((b) => ({
      accountHolderName: b.accountHolderName,
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      reEnteredAccountNumber: b.accountNumber,
      ifscCode: b.ifscCode,
      isDefault: b.isDefault,
    })),
    addresses: v.addresses
      .filter((a) => a.kind === "billing" || a.kind === "shipping")
      .map((a) => ({
        kind: a.kind as "billing" | "shipping",
        attention: a.attention ?? "",
        country: a.country ?? "India",
        addressLine1: a.addressLine1 ?? "",
        addressLine2: a.addressLine2 ?? "",
        city: a.city ?? "",
        state: a.state ?? "",
        zipCode: a.zipCode ?? "",
        phone: a.phone ?? "",
        fax: a.fax ?? "",
        isDefault: a.isDefault,
      })),
    contactPersons: v.contactPersons.map((p) => ({
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

  // Bind the vendor id so the action conforms to (input) => Promise<...>.
  const action = updateVendorAction.bind(null, v.id);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/vendors" className="hover:underline">
          Vendors
        </Link>
        <span className="mx-1">/</span>
        <Link
          href={`/purchases/vendors/${v.id}`}
          className="hover:underline"
        >
          {v.displayName}
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Edit</span>
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={`/purchases/vendors/${v.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit vendor
        </h1>
      </div>
      <VendorForm
        initial={initial}
        action={action}
        submitLabel="Update vendor"
        paymentTermsOptions={paymentTerms.map((p) => ({
          value: p.id,
          label: p.name,
        }))}
        accountsPayableOptions={apAccounts.map((a) => ({
          value: a.id,
          label: a.code ? `${a.code} — ${a.name}` : a.name,
        }))}
        tdsOptions={tdsTaxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${Number(t.rate)}%)`,
        }))}
      />
    </div>
  );
}
