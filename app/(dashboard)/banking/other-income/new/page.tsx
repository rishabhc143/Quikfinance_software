import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { QuickBankForm } from "@/components/dashboard/quick-bank-form";
import { createOtherIncomeAction } from "../../_shared";

export const metadata = { title: "New Other Income" };

export default async function NewOtherIncomePage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({ where: { organizationId: organization.id, isActive: true }, select: { id: true, name: true } });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/banking/other-income"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Other Income</h1>
      </div>
      <QuickBankForm title="Other income" accounts={accounts} action={createOtherIncomeAction} cancelHref="/banking/other-income" descriptionLabel="What kind of income?" />
    </div>
  );
}
