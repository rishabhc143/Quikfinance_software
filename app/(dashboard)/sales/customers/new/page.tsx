import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "../customer-form";
import { createCustomerAction } from "../actions";
import type { CustomerInput } from "@/lib/validations/customer";

export const metadata = { title: "New Customer" };

export default async function NewCustomerPage() {
  const { organization } = await requireOrganization();

  const [paymentTerms, members] = await Promise.all([
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      orderBy: { numberOfDays: "asc" },
    }),
    db.organizationMembership.findMany({
      where: { organizationId: organization.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  async function submit(values: CustomerInput) {
    "use server";
    await createCustomerAction(values);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back to customers">
            <Link href="/sales/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">New Customer</h1>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Close">
          <Link href="/sales/customers">
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <CustomerForm
        defaultCurrency={organization.currency}
        paymentTermsOptions={paymentTerms.map((p) => ({
          value: p.id,
          label: p.name,
          hint: p.numberOfDays === 0 ? "Due on receipt" : `${p.numberOfDays} days`,
        }))}
        customerOwnerOptions={members.map((m) => ({
          value: m.user.id,
          label: m.user.name ?? m.user.email,
          hint: m.role,
        }))}
        onSubmitAction={submit}
        submitLabel="Save"
      />
    </div>
  );
}
