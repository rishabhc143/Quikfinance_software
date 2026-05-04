import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { PaymentMadeForm } from "./form";
import { createPaymentMadeAction } from "../actions";

export const metadata = { title: "Record Payment" };

export default async function NewPaymentMadePage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const [vendors, bankAccounts] = await Promise.all([
    db.contact.findMany({ where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    db.bankAccount.findMany({ where: { organizationId: organization.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/purchases/payments-made"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Record Payment Made</h1>
      </div>
      <PaymentMadeForm
        vendors={vendors}
        bankAccounts={bankAccounts}
        currency={organization.currency}
        defaultVendorId={searchParams.vendor ?? null}
        defaultBillId={searchParams.bill ?? null}
        defaultDate={format(new Date(), "yyyy-MM-dd")}
        onSubmitAction={createPaymentMadeAction}
      />
    </div>
  );
}
