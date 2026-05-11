import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { VendorForm } from "../vendor-form";
import { createVendorAction } from "../actions";

export const metadata = { title: "New Vendor" };

export default async function NewVendorPage() {
  const { organization } = await requireOrganization();

  // Pre-fetch the dropdown options the form needs:
  //  - Payment Terms — used by the "Payment terms" combobox.
  //  - Accounts Payable — Liability accounts the user can pick.
  //  - TDS taxes — only rows with type='TDS' / 'tds' (we accept both
  //    casings; rare-tax tables sometimes have inconsistent casing).
  const [paymentTerms, apAccounts, tdsTaxes] = await Promise.all([
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/purchases/vendors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New Vendor</h1>
      </div>
      <VendorForm
        action={createVendorAction}
        submitLabel="Save vendor"
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
