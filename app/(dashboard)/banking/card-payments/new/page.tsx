import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { QuickBankForm } from "@/components/dashboard/quick-bank-form";
import { createCardPaymentAction } from "../../_shared";

export const metadata = { title: "New Card Payment" };

export default async function NewCardPaymentPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({ where: { organizationId: organization.id, isActive: true }, select: { id: true, name: true } });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/banking/card-payments"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Card Payment</h1>
      </div>
      <QuickBankForm title="Card payment details" accounts={accounts} action={createCardPaymentAction} cancelHref="/banking/card-payments" descriptionLabel="What was charged?" />
    </div>
  );
}
