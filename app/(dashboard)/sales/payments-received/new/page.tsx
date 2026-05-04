import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { PaymentReceivedForm } from "./form";
import { createPaymentReceivedAction } from "../actions";

export const metadata = { title: "Record Payment" };

export default async function NewPaymentReceivedPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const [customers, bankAccounts] = await Promise.all([
    db.contact.findMany({
      where: { organizationId: organization.id, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
      select: { id: true, displayName: true }, orderBy: { displayName: "asc" },
    }),
    db.bankAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/sales/payments-received"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Record Payment Received</h1>
      </div>
      <PaymentReceivedForm
        customers={customers}
        bankAccounts={bankAccounts}
        currency={organization.currency}
        defaultCustomerId={searchParams.customer ?? null}
        defaultInvoiceId={searchParams.invoice ?? null}
        defaultDate={format(new Date(), "yyyy-MM-dd")}
        onSubmitAction={createPaymentReceivedAction}
      />
    </div>
  );
}
