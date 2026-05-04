import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { QuoteForm } from "./form";

export const metadata = { title: "New Quote" };

export default async function NewQuotePage() {
  const { organization } = await requireOrganization();
  const contacts = await db.contact.findMany({
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
    orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
  });
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/sales/quotes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Quote</h1>
      </div>
      <QuoteForm contactOptions={contacts.map((c) => ({ value: c.id, label: c.displayName }))} currency={organization.currency} />
    </div>
  );
}
