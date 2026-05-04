import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { QuickBankForm } from "@/components/dashboard/quick-bank-form";
import { createOwnerDrawingAction } from "../../_shared";

export const metadata = { title: "New Owner Drawing" };

export default async function NewOwnerDrawingPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({ where: { organizationId: organization.id, isActive: true }, select: { id: true, name: true } });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/banking/owner-drawings"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Owner Drawing</h1>
      </div>
      <QuickBankForm title="Owner drawing" accounts={accounts} action={createOwnerDrawingAction} cancelHref="/banking/owner-drawings" descriptionLabel="Notes" />
    </div>
  );
}
