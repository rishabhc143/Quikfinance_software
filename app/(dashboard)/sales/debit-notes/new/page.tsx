import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { DebitNoteForm } from "../debit-note-form";
import { createDebitNoteAction } from "../actions";
import type { DebitNoteInput } from "@/lib/validations/debit-note";

export const metadata = { title: "New Debit Note" };

export default async function NewDebitNotePage() {
  const { organization } = await requireOrganization();
  const [contacts, items, taxes] = await Promise.all([
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        type: { in: ["CUSTOMER", "BOTH"] as ("CUSTOMER" | "BOTH")[] },
      },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, email: true, companyName: true },
    }),
    db.item.findMany({
      where: { organizationId: organization.id, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sellingPrice: true, salesDescription: true, unit: true },
    }),
    db.tax.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { rate: "asc" },
    }),
  ]);

  async function submit(values: DebitNoteInput) {
    "use server";
    await createDebitNoteAction(values);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/sales/debit-notes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">New Debit Note</h1>
      </div>
      <DebitNoteForm
        defaultCurrency={organization.currency}
        contactOptions={contacts.map((c) => ({
          value: c.id,
          label: c.displayName,
          hint: c.email ?? c.companyName ?? undefined,
        }))}
        itemOptions={items.map((i) => ({
          value: i.id,
          label: i.name,
          rate: i.sellingPrice ? String(i.sellingPrice) : "0",
          description: i.salesDescription ?? undefined,
          unit: i.unit ?? undefined,
        }))}
        taxOptions={taxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${Number(t.rate)}%)`,
          rate: Number(t.rate),
        }))}
        onSubmitAction={submit}
      />
    </div>
  );
}
