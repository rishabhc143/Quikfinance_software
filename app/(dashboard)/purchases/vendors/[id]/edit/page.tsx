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
  const v = await db.contact.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
    },
    include: { bankAccounts: { orderBy: { position: "asc" } } },
  });
  if (!v) notFound();

  // Map the Contact row + bank accounts into the VendorInput shape
  // the form expects. ISO strings for dates so the <Input type="date">
  // pre-fills.
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
    notes: v.notes,
    bankAccounts: v.bankAccounts.map((b) => ({
      accountHolderName: b.accountHolderName,
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      ifscCode: b.ifscCode,
      isDefault: b.isDefault,
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
      />
    </div>
  );
}
