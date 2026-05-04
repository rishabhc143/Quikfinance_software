import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { JournalEntryForm } from "./form";
import { createJournalEntryAction, type JournalEntryInput } from "../actions";

export const metadata = { title: "New Journal Entry" };

export default async function NewJournalEntryPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, type: true },
  });

  async function submit(input: JournalEntryInput) {
    "use server";
    await createJournalEntryAction(input);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/accountant/journal-entries"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Journal Entry</h1>
      </div>
      <JournalEntryForm
        accounts={accounts}
        currency={organization.currency}
        defaultDate={format(new Date(), "yyyy-MM-dd")}
        onSubmitAction={submit}
      />
    </div>
  );
}
